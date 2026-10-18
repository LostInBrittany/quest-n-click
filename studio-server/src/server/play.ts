// The game's origin (4.2.1, plan §6.1, policy F). The game's code is not trusted with a Studio session: everything
// that runs the game is served on `playUrl`, another origin, where no Studio API answers and the Studio's `__Host-`
// cookie never goes.
//   POST /api/play-ticket {path}  on the Studio (policy A, a member's browser session): a ticket, used once within
//                                 60 s, for a relative path of the game's origin.
//   GET  /_ticket?t=…             on the game's origin: the ticket becomes a game session (cookie `__Host-ws_play`),
//                                 then a redirect to its path. A ticket used twice or expired: 410.
//   any other path                 on the game's origin: served only to a live game session whose Studio session is
//                                 still live and whose user is still a member, checked at every request. Removing a
//                                 member, logging out, a back-channel logout or a suspension ends the access at the
//                                 next request, even with the cookie still there.
// The cookie is `Secure; HttpOnly; SameSite=None; Partitioned` (CHIPS): the game's origin is framed by the Studio, and
// on `*.cleverapps.io` the two are different sites (the domain is in the Public Suffix List). Spike S found CHIPS
// accepted by Chromium, Firefox and WebKit with their default settings, where a plain third-party cookie is refused by
// WebKit; a real Safari is the `studio-hosted` pass. A game session lasts 15 min, sliding, never past its Studio session.
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { StudioError } from '../ops/errors';
import { cookies } from './auth/gate';
import { safeReturn } from './auth/routes';
import type { AuthStore } from './auth/store';

export const PLAY_COOKIE = '__Host-ws_play';
const TICKET_MS = 60_000;
const SESSION_MS = 15 * 60_000;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const token = () => randomBytes(32).toString('base64url');

export interface PlayOptions {
  db: SqlDb;
  store: AuthStore;
  publicUrl: string;
  playUrl: string;
  /** The Studio session's idle limit (the gate's): a game session never outlives an idle Studio session either. */
  idleMs: number;
  /** What the game's origin serves to a live game session (4.2.1: the live preview). */
  content: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  now?: () => number;
}

export class Play {
  private now: () => number;
  constructor(private o: PlayOptions) {
    this.now = o.now ?? Date.now;
  }

  /** A ticket for `path` of the game's origin, to the Studio session `sessionHash` of `userId`. */
  async ticket(userId: string, sessionHash: string, path: string | null): Promise<string> {
    const t = token();
    const now = this.now();
    await this.o.db.run('DELETE FROM studio_play_tickets WHERE expires_at < $1', [now]);
    await this.o.db.run(
      'INSERT INTO studio_play_tickets (id_hash, user_id, session_hash, return_to, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [hash(t), userId, sessionHash, safeReturn(path), now + TICKET_MS],
    );
    return `${this.o.playUrl}/_ticket?t=${t}`;
  }

  /** The headers of every answer of the game's origin: framed by the Studio only, no referrer, nothing cached. */
  private headers(extra: Record<string, string | string[]> = {}) {
    return {
      'content-security-policy': `frame-ancestors ${this.o.publicUrl}`,
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    };
  }

  private refuse(res: ServerResponse, status: number, message: string) {
    res.writeHead(status, this.headers({ 'content-type': 'text/plain; charset=utf-8' }));
    res.end(message);
  }

  /** Answers a request of the game's origin. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const now = this.now();
    if (url.pathname === '/_ticket') {
      if (req.method !== 'GET') return this.refuse(res, 405, 'GET only');
      const t = url.searchParams.get('t') ?? '';
      const r = await this.o.db.tx('studio-play', async (q) => {
        const [row] = await q.all('SELECT * FROM studio_play_tickets WHERE id_hash = $1', [hash(t)]);
        await q.run('DELETE FROM studio_play_tickets WHERE id_hash = $1', [hash(t)]);
        return row;
      });
      if (!r || Number(r.expires_at) < now)
        return this.refuse(res, 410, 'this link was used or has expired: open the game again from the Studio');
      const studio = await this.liveStudioSession(String(r.session_hash), now);
      if (!studio) return this.refuse(res, 403, 'your Studio session has ended');
      const s = token();
      const expires = Math.min(now + SESSION_MS, studio.expiresAt);
      await this.o.db.run(
        'INSERT INTO studio_play_sessions (id_hash, user_id, session_hash, last_seen, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [hash(s), String(r.user_id), String(r.session_hash), now, expires],
      );
      await this.o.db.run('DELETE FROM studio_play_sessions WHERE expires_at < $1', [now]);
      res.writeHead(
        302,
        this.headers({
          location: String(r.return_to),
          'set-cookie': `${PLAY_COOKIE}=${s}; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
        }),
      );
      return void res.end();
    }
    const c = cookies(req)[PLAY_COOKIE];
    const [p] = c ? await this.o.db.all('SELECT * FROM studio_play_sessions WHERE id_hash = $1', [hash(c)]) : [];
    if (!p || Number(p.expires_at) <= now || Number(p.last_seen) + SESSION_MS <= now)
      return this.refuse(res, 401, 'open the game from the Studio');
    const studio = await this.liveStudioSession(String(p.session_hash), now);
    if (!studio || studio.user.id !== String(p.user_id)) {
      await this.o.db.run('DELETE FROM studio_play_sessions WHERE id_hash = $1', [hash(c!)]);
      return this.refuse(res, 403, 'your Studio session has ended');
    }
    // Sliding, at most once a minute (one write per request would be wasted).
    if (now - Number(p.last_seen) > 60_000)
      await this.o.db.run('UPDATE studio_play_sessions SET last_seen = $1 WHERE id_hash = $2', [now, hash(c!)]);
    for (const [k, v] of Object.entries(this.headers())) res.setHeader(k, v);
    await this.o.content(req, res);
  }

  /** The Studio session a game session depends on, when it is still live and its user still a member. */
  private async liveStudioSession(idHash: string, now: number) {
    const s = await this.o.store.sessionByHash(idHash);
    if (!s || s.expiresAt <= now || s.lastSeen + this.o.idleMs <= now || s.suspended || !s.role) return undefined;
    return s;
  }
}

/** True when a request is for the game's origin (routing by `Host`, plan §6.1; spike S confirmed it on Clever). */
export function forPlay(req: IncomingMessage, playUrl: string): boolean {
  return String(req.headers.host ?? '').toLowerCase() === new URL(playUrl).host.toLowerCase();
}

export function playTicketBody(b: unknown): string | null {
  if (!b || typeof b !== 'object') throw new StudioError('the body is a JSON object');
  const path = (b as { path?: unknown }).path;
  if (path !== undefined && typeof path !== 'string') throw new StudioError('`path` is a relative path of the game');
  return (path as string | undefined) ?? '/';
}
