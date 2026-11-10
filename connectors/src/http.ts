// What the connectors that listen over HTTP share (4.1.9): a body read under a limit, a per-address budget, a JSON
// answer, a listen that says its port. node:http only.
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** The body, refused (413) as soon as it passes `limit` bytes: never buffered beyond. */
export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'too-large');
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new HttpError(413, 'too-large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * The key an address is limited under (4.7.3, #500): an IPv4 address as it is, an IPv6 one by its /64 (one host is
 * usually handed a whole /64), an IPv4-mapped IPv6 address as its IPv4. The Bridge's `addressKey`, copied: the
 * connectors' package does not depend on the Bridge's.
 */
function addressKey(ip: string): string {
  const bare = ip.split('%')[0]!;
  if (!bare.includes(':')) return bare;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped) return mapped[1]!;
  const [head = '', tail] = bare.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups
    .slice(0, 4)
    .map((g) => (Number.parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}

/**
 * Requests per address (an IPv6 /64) and minute; once the map grows, it forgets idle addresses, at most one sweep a
 * minute (#500).
 */
export class PerAddress {
  private m = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(
    private perMinute: number,
    private now: () => number = Date.now,
  ) {}
  take(ip: string): boolean {
    const t = this.now();
    const address = addressKey(ip);
    if (this.m.size > 10_000 && t - this.lastSweep >= 60_000) {
      this.lastSweep = t;
      for (const [k, v] of this.m) if (!v.some((x) => x > t - 60_000)) this.m.delete(k);
    }
    const xs = (this.m.get(address) ?? []).filter((x) => x > t - 60_000);
    if (xs.length >= this.perMinute) {
      this.m.set(address, xs);
      return false;
    }
    xs.push(t);
    this.m.set(address, xs);
    return true;
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** Listens and resolves with the port actually bound (`port: 0` in the tests). */
export function listen(server: Server | import('node:net').Server, port: number, host: string): Promise<number> {
  return new Promise((ok, ko) => {
    server.once('error', ko);
    server.listen(port, host, () => {
      server.off('error', ko);
      ok((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Stops a server: no new connection, the requests in flight (`pending`) answered, then every connection still open
 * (idle keep-alives) closed.
 */
export async function closeServer(server: Server | undefined, pending: Iterable<Promise<unknown>> = []): Promise<void> {
  if (!server) return;
  const closed = new Promise<void>((ok) => server.close(() => ok()));
  await Promise.allSettled([...pending]);
  server.closeAllConnections?.();
  await closed;
}
