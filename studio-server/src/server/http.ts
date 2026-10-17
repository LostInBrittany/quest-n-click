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
        fn()
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
        fn()
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
        fail(new StudioError('body too large', 413));
        req.destroy();
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

export function studioServer(o: StudioServerOptions): Server {
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
        const epoch = await o.journal.epoch();
        if (url.searchParams.get('epoch') && url.searchParams.get('epoch') !== epoch)
          return send(res, 409, { error: 'another epoch: resynchronise', epoch });
        return send(res, 200, { epoch, revision: await o.journal.revision(), ops: await o.journal.opsAfter(after) });
      }
      const route = table.find(([m, re]) => m === req.method && re.test(sub));
      if (!route) return send(res, 404, { error: 'not found' });
      const write = req.method !== 'GET';
      if (write && !o.lease.held)
        return send(res, 503, { error: 'this instance does not serve writes yet; try again' }, { 'retry-after': '2' });
      const body = write ? await readJson(req) : {};
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
      if (op)
        await o.db
          .run('INSERT INTO studio_requests (op_id, status, body, at) VALUES ($1, 200, $2, $3)', [
            op,
            JSON.stringify(result ?? null),
            Date.now(),
          ])
          .catch(() => undefined);
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
  return server;
}
