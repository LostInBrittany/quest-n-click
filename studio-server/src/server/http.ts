// The Studio Server over HTTP (4.2.1, plan §4 and §7 row 4): node:http, the API of the dev server under `/api/`
// (studio-server/src/ops/routes.ts), the journal's cursor (`/api/ops`), three probes, one JSON log line per request
// with its id. Reads and writes of one instance never interleave: a write holds the instance's lock alone, reads
// share it, so a read never sees half of an operation. A write without the service lease is a 503 with Retry-After,
// and the client retries with the same operation id (P6, P8).
//
// Authentication comes with PR 5: until then `serve` refuses any address but the loopback.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { inAllowlist } from '../../../bridge/src/server';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { operationContext, type Studio } from '../ops/core';
import { isStudioError, StudioError } from '../ops/errors';
import type { Journal } from '../ops/journal';
import { isBody, routes } from '../ops/routes';
import type { ServiceLease } from './service-lease';

const MAX_JSON = 1024 * 1024;

/** One writer or many readers at a time (plan §4: no read sees two revisions mixed). */
class RwLock {
  private readers = 0;
  private writer = false;
  private queue: (() => void)[] = [];
  private next() {
    while (this.queue.length) {
      const w = this.queue[0]!;
      w();
      if (this.queue[0] === w) break;
    }
  }
  read<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((ok, fail) => {
      const go = () => {
        if (this.writer) return;
        this.queue.shift();
        this.readers++;
        // A handler that throws before its first await still releases the lock.
        Promise.resolve()
          .then(fn)
          .then(ok, fail)
          .finally(() => {
            this.readers--;
            this.next();
          });
        this.next();
      };
      this.queue.push(go);
      this.next();
    });
  }
  write<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((ok, fail) => {
      const go = () => {
        if (this.writer || this.readers) return;
        this.queue.shift();
        this.writer = true;
        Promise.resolve()
          .then(fn)
          .then(ok, fail)
          .finally(() => {
            this.writer = false;
            this.next();
          });
      };
      this.queue.push(go);
      this.next();
    });
  }
}

export interface StudioServerOptions {
  studio: Studio;
  journal: Journal;
  /** The journal's database: the answers of write requests are kept there by operation id. */
  db: SqlDb;
  lease: ServiceLease;
  /** Proxies whose X-Forwarded-For is believed. */
  trustProxy?: string[];
  /** One line per request; the default writes JSON to stdout. */
  log?: (line: Record<string, unknown>) => void;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_JSON) {
        // Answered with its 413; the rest of the body is drained, not read (no reset before the answer).
        fail(new StudioError('body too large', 413));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s.trim()) return ok({});
      try {
        ok(JSON.parse(s));
      } catch {
        fail(new StudioError('the body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

/** The routes that only read, although they are POSTs (a check takes its options in a body). */
const READ_POSTS = /^\/(validate|report|puzzle|coverage|playtests|lint|solve|screenshot)$/;

export interface StudioHttpServer extends Server {
  /** Runs `fn` holding the instance's lock alone (no request reads or writes meanwhile): the cache's repair. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

export function studioServer(o: StudioServerOptions): StudioHttpServer {
  const table = routes(o.studio);
  const lock = new RwLock();
  const log = o.log ?? ((l) => process.stdout.write(`${JSON.stringify(l)}\n`));
  const proxies = o.trustProxy ?? [];
  const clientOf = (req: IncomingMessage) => {
    const peer = req.socket.remoteAddress ?? 'unknown';
    if (!proxies.length || !inAllowlist(peer, proxies)) return peer;
    const hops = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) if (!inAllowlist(hops[i]!, proxies)) return hops[i]!;
    return peer;
  };
  let started = false;

  const server = createServer(async (req, res) => {
    const id = randomUUID();
    const t0 = performance.now();
    const url = new URL(req.url ?? '/', 'http://studio.invalid');
    const path = url.pathname;
    res.setHeader('x-request-id', id);
    res.on('finish', () =>
      log({
        event: 'request',
        id,
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round(performance.now() - t0),
        client: clientOf(req),
      }),
    );
    try {
      // The probes: no session, no data.
      if (path === '/livez') return send(res, 200, { ok: true });
      if (path === '/startz') return send(res, started ? 200 : 503, { ok: started });
      if (path === '/readyz')
        return send(res, o.lease.held ? 200 : 503, { ok: o.lease.held, writes: o.lease.held ? 'served' : 'waiting' });
      if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });
      const sub = path.slice('/api'.length);
      // The journal's cursor (P6): what a client that reconnects missed.
      if (req.method === 'GET' && sub === '/revision')
        return send(res, 200, { epoch: await o.journal.epoch(), revision: await o.journal.revision() });
      if (req.method === 'GET' && sub === '/ops') {
        const after = Number(url.searchParams.get('after') ?? '0');
        if (!Number.isInteger(after) || after < 0) throw new StudioError('`after` is a revision number');
        const r = await lock.read(async () => {
          const epoch = await o.journal.epoch();
          const ops = await o.journal.opsAfter(after);
          // `next`: the cursor to ask from next time (the last op given; the list may be cut by its limit).
          return { epoch, revision: await o.journal.revision(), ops, next: ops.at(-1)?.rev ?? after };
        });
        if (url.searchParams.get('epoch') && url.searchParams.get('epoch') !== r.epoch)
          return send(res, 409, { error: 'another epoch: resynchronise', epoch: r.epoch });
        return send(res, 200, r);
      }
      const route = table.find(([m, re]) => m === req.method && re.test(sub));
      if (!route) return send(res, 404, { error: 'not found' });
      const write = req.method !== 'GET' && !(req.method === 'POST' && READ_POSTS.test(sub));
      if (write && !o.lease.held)
        return send(res, 503, { error: 'this instance does not serve writes yet; try again' }, { 'retry-after': '2' });
      const body = req.method !== 'GET' ? await readJson(req) : {};
      if (!isBody(body)) throw new StudioError('the body must be a JSON object');
      // P6: a write may carry its operation id; a retry with the same id gets the same answer, applied once.
      const op = write ? req.headers['x-studio-op'] : undefined;
      if (op !== undefined && (typeof op !== 'string' || !/^[\w-]{8,64}$/.test(op)))
        throw new StudioError('x-studio-op must be 8 to 64 letters, digits, - or _');
      if (op) {
        const [seen] = await o.db.all('SELECT status, body FROM studio_requests WHERE op_id = $1', [op]);
        if (seen) return send(res, Number(seen.status), JSON.parse(String(seen.body)), { 'x-studio-replayed': '1' });
      }
      const run = () =>
        operationContext.run({ id: op }, () => Promise.resolve(route[2](sub.match(route[1])!, body, { baseUrl: '' })));
      const result = await (write ? lock.write(run) : lock.read(run));
      if (op) {
        // Kept 7 days: long enough for any retry of a client that was cut off.
        await o.db.run('DELETE FROM studio_requests WHERE at < $1', [Date.now() - 7 * 86_400_000]);
        await o.db.run('INSERT INTO studio_requests (op_id, status, body, at) VALUES ($1, 200, $2, $3)', [
          op,
          JSON.stringify(result ?? null),
          Date.now(),
        ]);
      }
      return send(res, 200, result);
    } catch (e) {
      if (isStudioError(e)) {
        const body = { error: e.message, ...((e as { body?: object }).body ?? {}) };
        return send(res, e.status, body, e.status === 503 ? { 'retry-after': '2' } : {});
      }
      log({ event: 'error', id, message: String((e as Error)?.message ?? e).slice(0, 300) });
      return send(res, 500, { error: 'internal error', id });
    }
  });
  server.on('listening', () => {
    started = true;
  });
  return Object.assign(server, { exclusive: <T>(fn: () => Promise<T>) => lock.write(fn) });
}
