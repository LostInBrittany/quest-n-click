// What a shared Studio sees live (4.2.1, plan §5, P7): who is here, and an SSE stream of what changes.
//   - Presence: kept in memory, renewed by the HTTP heartbeat (`POST /api/presence`, every 30 s), gone after 60 s.
//   - `GET /api/events`: a `hello` with the epoch, the revision, the leases and who is here; then `revision` after each
//     committed operation (id, revision, author, files, spans), `leases` and `presence` when they change, and a ping
//     every 15 s. Events are sent at least once, after the commit; a client that missed some reads `GET /api/ops`.
//   - A stream closes (plan §3.6) on a revocation of its user or the end of its session, within 5 s: at once on the
//     revocation bus, at the end of its Bearer token, and by a check of its credential every 30 s, which also catches
//     a demotion below reviewer. The client reconnects with a fresh credential.
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Confirmed, Journal } from '../ops/journal';
import { spansOf } from '../ops/spans';
import type { Gate, Principal } from './auth/gate';
import type { Leases } from './leases';

export interface Here {
  userId: string;
  name: string;
  /** What they look at (a room, a span), as the client says. */
  where?: string;
  at: number;
}

export class Presence {
  /** `changed` (): someone came, moved or left. */
  readonly events = new EventEmitter();
  private here = new Map<string, Here>();
  private timer: NodeJS.Timeout;

  constructor(
    private ttlMs = 60_000,
    private now: () => number = Date.now,
  ) {
    this.events.setMaxListeners(0);
    this.timer = setInterval(() => this.sweep(), 15_000);
    this.timer.unref();
  }

  beat(userId: string, name: string, where?: string): void {
    const prev = this.here.get(userId);
    this.here.set(userId, { userId, name, where, at: this.now() });
    if (!prev || prev.where !== where) this.events.emit('changed');
  }

  leave(userId: string): void {
    if (this.here.delete(userId)) this.events.emit('changed');
  }

  list(): Here[] {
    this.sweep();
    return [...this.here.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private sweep(): void {
    const now = this.now();
    let gone = false;
    for (const [k, h] of this.here) if (now - h.at > this.ttlMs) gone = this.here.delete(k) || gone;
    if (gone) this.events.emit('changed');
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

const spansOrNone = (paths: string[]) => {
  try {
    return spansOf(paths);
  } catch {
    return [];
  }
};

/** Serves one SSE stream until its client leaves or its credential ends. */
export async function serveEvents(
  req: IncomingMessage,
  res: ServerResponse,
  o: { principal?: Principal; gate?: Gate; journal: Journal; leases?: Leases; presence?: Presence; recheckMs?: number },
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  const event = (name: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const p = o.principal;
  const cleanups: (() => void)[] = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const c of cleanups) c();
    res.end();
  };
  req.on('close', close);

  const on = <T>(em: EventEmitter, name: string, fn: (x: T) => void) => {
    em.on(name, fn);
    cleanups.push(() => em.off(name, fn));
  };
  on<Confirmed>(o.journal.events, 'confirmed', (c) => event('revision', { ...c, spans: spansOrNone(c.paths) }));
  if (o.leases) on(o.leases.events, 'changed', () => void o.leases!.list().then((l) => event('leases', { leases: l })));
  // A write claims spans in its own transaction: the leases are sent again after each revision too.
  if (o.leases) on(o.journal.events, 'confirmed', () => void o.leases!.list().then((l) => event('leases', { leases: l })));
  if (o.presence) on(o.presence.events, 'changed', () => event('presence', { here: o.presence!.list() }));
  if (p && o.gate) {
    on<string[]>(o.gate.revocations, 'revoked', (ids) => ids.includes(p.user.id) && close());
    on<string[]>(o.gate.revocations, 'session-ended', (ids) => !!p.session && ids.includes(p.session.idHash) && close());
    if (p.expiresAt) {
      const t = setTimeout(close, Math.max(0, p.expiresAt - Date.now()));
      cleanups.push(() => clearTimeout(t));
    }
    const gate = o.gate;
    const recheck = setInterval(() => {
      gate.authenticate(req).then(
        (q) => {
          if (q.user.id !== p.user.id) close();
          else gate.require(q, 'reviewer');
        },
        () => close(),
      ).catch(() => close());
    }, o.recheckMs ?? 30_000);
    cleanups.push(() => clearInterval(recheck));
  }
  const ping = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);
  cleanups.push(() => clearInterval(ping));

  event('hello', {
    epoch: await o.journal.epoch(),
    revision: await o.journal.revision(),
    leases: o.leases ? await o.leases.list() : [],
    here: o.presence ? o.presence.list() : [],
  });
}
