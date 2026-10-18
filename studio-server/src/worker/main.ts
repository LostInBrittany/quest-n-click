// The processing worker (4.2.1, plan §3.8, ADR 0028): a separate Clever Cloud application that holds no secret of
// the platform — no database, no session key, no permanent Cellar credentials, no signing key. It is the trusted
// supervisor of one job at a time:
//   POST /jobs {token}   checks the Studio's signature (public key only), the instance, the expiry and single use;
//                        fetches the snapshot by its presigned URL and checks its sha256 against the signed one;
//                        runs the game's code in a fresh child process, in a fresh folder, with an emptied
//                        environment, killed at its deadline with its whole process group; bounds the output (a
//                        verdict, or the module as data) and PUTs it to the presigned result URL itself; removes the
//                        folder.
//   GET /livez, /readyz  /readyz answers 503 once a job left a process behind: the instance is to be recycled.
// The job's code shares this machine and this system user: it is assumed to see the job's capabilities (ADR 0028).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Job, publicKeyOf, verifyJob } from './job';
import { unpackSnapshot } from './snapshot';

const CHILD = fileURLToPath(new URL('./child.ts', import.meta.url));
// A game imports `web-scumm/content` by the package's self-reference: its folder must sit inside the package.
const JOBS = fileURLToPath(new URL('../../../.cache/jobs/', import.meta.url));
const MAX_OUT = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;

export interface WorkerOptions {
  publicKeyPem: string;
  /** The only Studio instance whose jobs this worker runs (one project, one trust domain). */
  instance: string;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

/** What the worker writes at the result URL: the job it answers, and its output or why there is none. */
export interface JobResult {
  job: string;
  kind: Job['kind'];
  ms: number;
  /** validate: the verdict. */
  errors?: string[];
  warnings?: string[];
  /** load: the module as data. */
  module?: unknown;
  /** The game's code did not run to its end (a timeout, a crash, output that is not JSON). */
  failed?: string;
}

/** Runs `child.ts` on `dir`: an emptied environment, its own process group, killed at `timeoutMs`. */
export function runChild(dir: string, timeoutMs: number, kind: Job['kind'] = 'validate'): Promise<{ out: string; code: number | null; timedOut: boolean; pid: number }> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), CHILD, dir, kind], {
      cwd: dir,
      env: {},
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    let timedOut = false;
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= MAX_OUT) chunks.push(c);
      else killGroup();
    });
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      killGroup();
      out = size <= MAX_OUT ? Buffer.concat(chunks).toString('utf8') : '';
      ok({ out, code, timedOut, pid: child.pid ?? 0 });
    });
  });
}

/** True when a process of the group `pid` is still alive after the job. */
function survivors(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

const strings = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? v.slice(0, max).map((x) => String(x).slice(0, 2_000)) : [];

export function createWorker(o: WorkerOptions) {
  const key = publicKeyOf(o.publicKeyPem);
  const seen = new Map<string, number>();
  let recycle = false;
  let chain: Promise<unknown> = Promise.resolve();
  let queued = 0;
  const log = o.log ?? (() => {});

  async function run(job: Job): Promise<JobResult> {
    const snap = await fetch(job.urls.snapshot, { signal: AbortSignal.timeout(30_000) });
    if (!snap.ok) throw new Error(`snapshot: ${snap.status}`);
    const bytes = Buffer.from(await snap.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== job.snapshot) throw new Error('the snapshot is not the signed one');
    mkdirSync(JOBS, { recursive: true });
    const dir = mkdtempSync(join(JOBS, 'job-'));
    try {
      unpackSnapshot(bytes, dir);
      const timeoutMs = Math.min(Number(job.params.timeoutMs) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
      const t0 = Date.now();
      const r = await runChild(dir, timeoutMs, job.kind);
      if (r.pid && survivors(r.pid)) {
        recycle = true;
        log('worker-survivor', { job: job.id });
      }
      const result: JobResult = { job: job.id, kind: job.kind, ms: 0 };
      let parsed: unknown;
      if (r.timedOut) result.failed = `the game's code did not finish within ${timeoutMs} ms`;
      else
        try {
          parsed = JSON.parse(r.out);
        } catch {
          result.failed = `the game does not load (exit ${r.code})`;
        }
      if (!result.failed && job.kind === 'validate') {
        const v = (parsed ?? {}) as { errors?: unknown; warnings?: unknown };
        result.errors = strings(v.errors);
        result.warnings = strings(v.warnings);
      } else if (!result.failed) result.module = parsed;
      result.ms = Date.now() - t0;
      const put = await fetch(job.urls.result, {
        method: 'PUT',
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(30_000),
      });
      if (!put.ok) throw new Error(`result: ${put.status}`);
      return result;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const path = new URL(req.url ?? '/', 'http://w').pathname;
    if (req.method === 'GET' && path === '/livez') return send(200, { ok: true });
    if (req.method === 'GET' && path === '/readyz') return send(recycle ? 503 : 200, { ok: !recycle, recycle });
    if (req.method !== 'POST' || path !== '/jobs') return send(404, { error: 'not found' });
    let raw = '';
    for await (const c of req) {
      raw += c;
      if (raw.length > 64_000) return send(413, { error: 'too large' });
    }
    let job: Job;
    try {
      const { token } = JSON.parse(raw) as { token?: unknown };
      job = verifyJob(String(token), key);
      if (job.instance !== o.instance) throw new Error('the job is for another instance');
    } catch (e) {
      return send(403, { error: (e as Error).message });
    }
    const now = Date.now();
    for (const [id, exp] of seen) if (exp < now) seen.delete(id);
    if (seen.has(job.id)) return send(409, { error: 'the job was already run' });
    seen.set(job.id, job.exp);
    if (recycle) return send(503, { error: 'this instance is to be recycled' });
    if (queued >= 8) return send(429, { error: 'busy' });
    queued++;
    const p = chain.then(() => run(job));
    chain = p.catch(() => {});
    try {
      const v = await p;
      log('worker-job', { job: job.id, kind: v.kind, failed: !!v.failed, ms: v.ms });
      send(200, { ok: true });
    } catch (e) {
      log('worker-job-failed', { job: job.id, error: (e as Error).message });
      send(502, { error: (e as Error).message });
    } finally {
      queued--;
    }
  }

  return { handler: (req: IncomingMessage, res: ServerResponse) => void handle(req, res), get recycle() { return recycle; } };
}

// `studio-worker` itself: WORKER_PUBLIC_KEY (PEM, or WORKER_PUBLIC_KEY_FILE), WORKER_INSTANCE, PORT (Clever: 8080).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { readFileSync } = await import('node:fs');
  const pem = process.env.WORKER_PUBLIC_KEY_FILE ? readFileSync(process.env.WORKER_PUBLIC_KEY_FILE, 'utf8') : process.env.WORKER_PUBLIC_KEY;
  const instance = process.env.WORKER_INSTANCE;
  const publicKeyPem = pem?.replace(/\\n/g, '\n');
  if (!pem || !instance) {
    process.stderr.write('studio-worker: WORKER_PUBLIC_KEY and WORKER_INSTANCE are required\n');
    process.exit(2);
  }
  const w = createWorker({
    publicKeyPem: publicKeyPem!,
    instance,
    log: (event, data) => process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), event, ...data })}\n`),
  });
  const server = createServer(w.handler);
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
