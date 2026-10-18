// The Studio's side of the processing worker (4.2.1, plan §3.8, ADR 0028): the `Executor` of a hosted Studio. Every
// run of the game's code goes there: the guard's validations, and the loads of the game module the Studio reads. For
// each job it packs a snapshot of the folder, puts it under `staging/<job>/`, presigns one read (the snapshot) and one
// write (the result) for at most 5 min, signs the job with its Ed25519 key, and asks the worker. It then reads the
// result itself, checks that it answers this job and is bounded, and deletes the staging prefix. The worker never
// names a key the Studio publishes. A result is a signal in the project's trust domain, never a security decision.
// The last answer of each kind is kept by the snapshot's sha256: an unchanged game is not sent again.
import { createHash, randomUUID } from 'node:crypto';
import type { ValidateResult } from '../../../tools/studio/types';
import { type Job, type JobKind, MAX_JOB_MS, privateKeyOf, signJob } from '../worker/job';
import type { JobResult } from '../worker/main';
import { packSnapshot } from '../worker/snapshot';
import type { S3 } from './s3';

export interface RemoteExecutorOptions {
  s3: Pick<S3, 'put' | 'get' | 'delete' | 'presign'>;
  workerUrl: string;
  privateKeyPem: string;
  instance: string;
  /** The journal's epoch and head, bound into each job. */
  at: () => { epoch: string; rev: number } | Promise<{ epoch: string; rev: number }>;
  timeoutMs?: number;
}

const MAX_RESULT = 32 * 1024 * 1024;

export function remoteExecutor(o: RemoteExecutorOptions) {
  const key = privateKeyOf(o.privateKeyPem);
  const timeoutMs = Math.min(o.timeoutMs ?? 60_000, 120_000);
  const last = new Map<JobKind, { sha: string; result: JobResult }>();

  async function run(kind: JobKind, dir: string): Promise<JobResult> {
    const snapshot = packSnapshot(dir);
    const sha = createHash('sha256').update(snapshot).digest('hex');
    const hit = last.get(kind);
    if (hit?.sha === sha) return hit.result;
    const id = randomUUID();
    const dest = `staging/${id}/`;
    try {
      await o.s3.put(`${dest}snapshot.json`, snapshot);
      const seconds = Math.floor(MAX_JOB_MS / 1000);
      const job: Job = {
        id,
        instance: o.instance,
        ...(await o.at()),
        kind,
        params: { timeoutMs },
        snapshot: sha,
        dest,
        exp: Date.now() + MAX_JOB_MS,
        urls: {
          snapshot: o.s3.presign('GET', `${dest}snapshot.json`, seconds),
          result: o.s3.presign('PUT', `${dest}result.json`, seconds),
        },
      };
      const r = await fetch(`${o.workerUrl.replace(/\/$/, '')}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signJob(job, key) }),
        signal: AbortSignal.timeout(timeoutMs + 60_000),
      });
      await r.body?.cancel();
      if (!r.ok) throw new Error(`the processing worker refused the job (${r.status})`);
      const bytes = await o.s3.get(`${dest}result.json`);
      if (!bytes || bytes.length > MAX_RESULT) throw new Error('the processing worker left no usable result');
      const v = JSON.parse(bytes.toString('utf8')) as JobResult;
      if (v.job !== id || v.kind !== kind) throw new Error('the processing worker result does not answer this job');
      if (!v.failed && kind === 'validate' && (!Array.isArray(v.errors) || !Array.isArray(v.warnings)))
        throw new Error('the processing worker result does not answer this job');
      last.set(kind, { sha, result: v });
      return v;
    } finally {
      await Promise.all([o.s3.delete(`${dest}snapshot.json`), o.s3.delete(`${dest}result.json`)]).catch(() => {});
    }
  }

  return {
    async validate(dir: string): Promise<ValidateResult> {
      const t0 = Date.now();
      const v = await run('validate', dir);
      const errors = v.failed ? [v.failed] : v.errors!.map(String);
      return { ok: errors.length === 0, errors, warnings: (v.warnings ?? []).map(String), ms: Date.now() - t0 };
    },
    /** The game module as data, for the Studio's reads (functions dropped, as `importInChild` gives it). */
    async load(dir: string): Promise<unknown> {
      const v = await run('load', dir);
      if (v.failed) throw new Error(v.failed);
      return v.module;
    },
  };
}
