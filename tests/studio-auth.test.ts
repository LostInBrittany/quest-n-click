// Authentication and rights of the Studio Server (4.2.1, plan §3, ADR 0027), against a test OpenID provider: the
// login (code + PKCE + state + nonce), the four HTTP policies and their exceptions, invitations, the roles over every
// route, the owner's routes, the back-channel logout, and the revocation bounds (R = 15 min) on a simulated clock.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { Journal } from '../studio-server/src/ops/journal';
import { routes } from '../studio-server/src/ops/routes';
import { accessToken, deviceLogin } from '../studio-server/src/server/auth/device';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes, safeReturn } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { readJson, roleFor, send, studioServer } from '../studio-server/src/server/http';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, op: TestOp, store: AuthStore, gate: Gate, stop: () => void;
let clock = Date.now();

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });

/** The value of a Set-Cookie for `name`. */
const cookieOf = (r: Response, name: string) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]!
    .slice(name.length + 1);

/** A full login as the provider's current user, carrying `invite`; returns the session cookie. */
async function login(o: { invite?: string; returnTo?: string } = {}): Promise<{ session?: string; location: string }> {
  const q = new URLSearchParams({
    ...(o.returnTo ? { returnTo: o.returnTo } : {}),
    ...(o.invite ? { invite: o.invite } : {}),
  });
  const r1 = await fetch(`${base}/auth/login?${q}`, { redirect: 'manual' });
  expect(r1.status).toBe(302);
  const pre = cookieOf(r1, '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return { session: cookieOf(r3, '__Host-ws_session'), location: r3.headers.get('location') ?? '' };
}

const withCookie = (s: string, init: RequestInit = {}) => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), cookie: `__Host-ws_session=${s}` },
});
const write = (s: string, body: unknown, extra: Record<string, string> = {}) =>
  withCookie(s, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: base, 'x-studio-request': '1', ...extra },
  });

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-auth-'));
  op = await new TestOp().start();
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
  const lease = new ServiceLease(db);
  await lease.tick();
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const oidc = await Oidc.discover({
    issuer: op.issuer,
    clientId: op.clientId,
    clientSecret: op.clientSecret,
    audience: op.audience,
    allowInsecure: true,
  });
  const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
  store = new AuthStore(db);
  gate = new Gate({ store, oidc, sealer, publicUrl: base, now: () => clock });
  const handle = authRoutes({
    gate,
    store,
    oidc,
    sealer,
    publicUrl: base,
    cliClientId: 'web-scumm-cli',
    send,
    readJson,
  });
  const server = studioServer({ studio, journal, db, lease, log: () => {}, perMinute: 10_000, auth: { gate, handle } });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  stop = () => {
    server.close();
    op.stop();
  };
}, 60_000);
afterAll(() => {
  stop();
  rmSync(tmp, { recursive: true, force: true });
});

let owner = '',
  dev = '',
  reviewer = '';

describe('login and invitations', () => {
  it('nobody gets in without a session', async () => {
    const r = await fetch(`${base}/api/game`);
    expect(r.status).toBe(401);
  });

  it('an invitation makes the first owner; the session cookie is set at the callback', async () => {
    const token = await store.invite('lea@example.org', 'owner', 'test');
    const l = await login({ invite: token, returnTo: '/rooms' });
    expect(l.location).toBe('/rooms');
    owner = l.session!;
    expect((await fetch(`${base}/api/game`, withCookie(owner))).status).toBe(200);
    const me = (await (await fetch(`${base}/auth/me`, withCookie(owner))).json()) as { role: string };
    expect(me.role).toBe('owner');
  });

  it('an invitation is used once, and only by the verified email it names', async () => {
    const token = await store.invite('tom@example.org', 'dev', 'test');
    op.user = { sub: 'u-eve', email: 'eve@example.org', emailVerified: true };
    const eve = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(eve.session!))).status).toBe(403);
    op.user = { sub: 'u-tom', email: 'tom@example.org', emailVerified: false };
    const unverified = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(unverified.session!))).status).toBe(403);
    op.user = { sub: 'u-tom', email: 'tom@example.org', emailVerified: true };
    dev = (await login({ invite: token })).session!;
    expect((await fetch(`${base}/api/game`, withCookie(dev))).status).toBe(200);
    op.user = { sub: 'u-max', email: 'max@example.org', emailVerified: true };
    const reused = await login({ invite: token });
    expect((await fetch(`${base}/api/game`, withCookie(reused.session!))).status).toBe(403);
  });

  it('a login page used twice is refused, and the return path is never another site', async () => {
    const r1 = await fetch(`${base}/auth/login`, { redirect: 'manual' });
    const pre = cookieOf(r1, '__Host-ws_pre')!;
    const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
    const cb = r2.headers.get('location')!;
    expect((await fetch(cb, { redirect: 'manual', headers: { cookie: `__Host-ws_pre=${pre}` } })).status).toBe(302);
    expect((await fetch(cb, { redirect: 'manual', headers: { cookie: `__Host-ws_pre=${pre}` } })).status).toBe(400);
    expect(safeReturn('//evil.example/x')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil')).toBe('/');
    expect(safeReturn('/rooms?x=1')).toBe('/rooms?x=1');
  });
});

describe('policy A: the session cookie', () => {
  it('a mutation needs the exact Origin, the Studio header and JSON', async () => {
    const ok = await fetch(`${base}/api/notes`, write(dev, { text: 'from a dev' }));
    expect(ok.status).toBe(200);
    expect(
      (await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { origin: 'https://evil.example' }))).status,
    ).toBe(403);
    const noOrigin = write(dev, { text: 'x' });
    delete (noOrigin.headers as Record<string, string>).origin;
    expect((await fetch(`${base}/api/notes`, noOrigin)).status).toBe(403);
    expect((await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { 'x-studio-request': '0' }))).status).toBe(403);
    expect((await fetch(`${base}/api/notes`, write(dev, { text: 'x' }, { 'content-type': 'text/plain' }))).status).toBe(
      415,
    );
  });

  it('a reviewer reads and never writes; a dev never reaches the owner routes', async () => {
    const token = await store.invite('ana@example.org', 'reviewer', 'test');
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    reviewer = (await login({ invite: token })).session!;
    expect((await fetch(`${base}/api/notes`, withCookie(reviewer))).status).toBe(200);
    expect((await fetch(`${base}/api/notes`, write(reviewer, { text: 'no' }))).status).toBe(403);
    expect((await fetch(`${base}/api/validate`, write(reviewer, {}))).status).toBe(200);
    expect((await fetch(`${base}/api/members`, withCookie(dev))).status).toBe(403);
  });
});

describe('policy B: Bearer access tokens', () => {
  const bearer = (t: string, init: RequestInit = {}) => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${t}` },
  });

  it('a member with a valid token reads and writes, with no Origin', async () => {
    const t = await op.accessToken({ sub: 'u-tom' });
    expect((await fetch(`${base}/api/game`, bearer(t))).status).toBe(200);
    const w = await fetch(
      `${base}/api/notes`,
      bearer(t, { method: 'POST', body: '{"text":"cli"}', headers: { 'content-type': 'application/json' } }),
    );
    expect(w.status).toBe(200);
  });

  it('a Bearer request ignores the cookie: a bad token is refused even with a good session', async () => {
    const r = await fetch(`${base}/api/game`, bearer('a.b.c', { headers: { cookie: `__Host-ws_session=${owner}` } }));
    expect(r.status).toBe(401);
  });

  it('refuses an id_token, another audience, a token living too long, a non-member, a foreign origin', async () => {
    const idt = await op.idToken('u-tom', 'n');
    expect((await fetch(`${base}/api/game`, bearer(idt))).status).toBe(401);
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-tom', aud: 'other' })))).status).toBe(
      401,
    );
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-tom', life: 3600 })))).status).toBe(
      401,
    );
    expect((await fetch(`${base}/api/game`, bearer(await op.accessToken({ sub: 'u-eve' })))).status).toBe(403);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'u-tom', aud: op.audience, iss: op.issuer })).toString('base64url')}.x`;
    expect((await fetch(`${base}/api/game`, bearer(unsigned))).status).toBe(401);
    const t = await op.accessToken({ sub: 'u-tom' });
    expect((await fetch(`${base}/api/game`, bearer(t, { headers: { origin: 'https://evil.example' } }))).status).toBe(
      403,
    );
  });
});

describe('the owner', () => {
  it('lists members, invites, cannot demote the last owner, and a removal ends access at once', async () => {
    const list = (await (await fetch(`${base}/api/members`, withCookie(owner))).json()) as {
      members: { id: string; email: string; role: string }[];
    };
    const lea = list.members.find((m) => m.email === 'lea@example.org')!;
    const r = await fetch(`${base}/api/members/${lea.id}`, { ...write(owner, { role: 'dev' }), method: 'PUT' });
    expect(r.status).toBe(409);
    const inv = (await (
      await fetch(`${base}/api/invitations`, write(owner, { email: 'sam@example.org', role: 'dev' }))
    ).json()) as {
      link: string;
    };
    expect(inv.link).toMatch(/\/auth\/login\?invite=[\w-]{40,}$/);
    // Tom removed: his session and his tokens stop at the next request.
    const tom = list.members.find((m) => m.email === 'tom@example.org')!;
    const t = await op.accessToken({ sub: 'u-tom' });
    clock += 1;
    expect((await fetch(`${base}/api/members/${tom.id}`, { ...write(owner, {}), method: 'DELETE' })).status).toBe(200);
    expect((await fetch(`${base}/api/game`, withCookie(dev))).status).toBe(401);
    // A token issued before the removal is revoked (401), whatever its expiry.
    expect((await fetch(`${base}/api/game`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(401);
    const audit = (await (await fetch(`${base}/api/audit`, withCookie(owner))).json()) as {
      entries: { event: string }[];
    };
    expect(audit.entries.map((e) => e.event)).toContain('member-removed');
  });
});

describe('policy D: back-channel logout', () => {
  const post = (body: string, type = 'application/x-www-form-urlencoded') =>
    fetch(`${base}/auth/backchannel`, { method: 'POST', body, headers: { 'content-type': type } });

  it('ends the sessions of a provider session, with no Origin; a replay, a nonce, no event or JSON are refused', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.sid = 'sid-ana';
    const s = (await login()).session!;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
    const token = await op.logoutToken({ sid: 'sid-ana', jti: 'j-1' });
    expect((await post(`logout_token=${token}`)).status).toBe(200);
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
    expect((await post(`logout_token=${token}`)).status).toBe(400);
    expect((await post(`logout_token=${await op.logoutToken({ sid: 'x', nonce: 'n' })}`)).status).toBe(400);
    expect((await post(`logout_token=${await op.logoutToken({ sid: 'x', events: false })}`)).status).toBe(400);
    expect((await post(JSON.stringify({ logout_token: token }), 'application/json')).status).toBe(400);
  });
});

describe('revocation within R (simulated clock)', () => {
  it('a provider unreachable past R suspends the session (503), which comes back once it answers', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    op.sid = 'sid-2';
    const s = (await login()).session!;
    op.down = true;
    clock += 6 * 60_000;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
    clock += 10 * 60_000;
    const r = await fetch(`${base}/api/game`, withCookie(s));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { suspended?: boolean }).suspended).toBe(true);
    op.down = false;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(200);
  });

  it('a user disabled at the provider loses the session at the next check', async () => {
    op.user = { sub: 'u-ana', email: 'ana@example.org', emailVerified: true };
    const s = (await login()).session!;
    op.disabled.add('u-ana');
    clock += 6 * 60_000;
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
    op.disabled.delete('u-ana');
  });
});

describe('logout and the CLI', () => {
  it('logout ends the session and gives the provider logout URL', async () => {
    op.user = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true };
    const s = (await login()).session!;
    const r = await fetch(`${base}/auth/logout`, write(s, {}));
    const b = (await r.json()) as { redirect: string };
    expect(b.redirect.startsWith(`${op.issuer}/logout`)).toBe(true);
    expect((await fetch(`${base}/api/game`, withCookie(s))).status).toBe(401);
  });

  it('the CLI logs in with the device flow, keeps its tokens 0600, and its token opens the API', async () => {
    op.user = { sub: 'u-lea', email: 'lea@example.org', emailVerified: true };
    const file = join(tmp, 'tokens.json');
    let told = '';
    await deviceLogin(base, { file, allowInsecure: true, tell: (url, code) => (told = `${url} ${code}`) });
    expect(told).toContain('WXYZ-1234');
    const { statSync } = await import('node:fs');
    expect(statSync(file).mode & 0o077).toBe(0);
    const t = await accessToken(base, { file, allowInsecure: true });
    expect((await fetch(`${base}/api/game`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(200);
  }, 30_000);

  it('tells the CLI the issuer, its client and the audience', async () => {
    expect(await (await fetch(`${base}/auth/cli`)).json()).toEqual({
      issuer: op.issuer,
      client_id: 'web-scumm-cli',
      audience: op.audience,
    });
  });
});

describe('the roles over every route', () => {
  it('reading needs a reviewer, writing a dev; the read-only POSTs are reads', () => {
    const studio = { gameDir: '' } as never;
    for (const [method, re] of routes(studio)) {
      const sub = re.source
        .replace(/^\^\\/, '/')
        .replace(/\\\//g, '/')
        .replace(/\(.*?\)/g, 'x')
        .replace(/\$$/, '');
      const role = roleFor(method, sub);
      const reads =
        method === 'GET' || /^\/(validate|report|puzzle|coverage|playtests|lint|solve|screenshot)$/.test(sub);
      expect([method, sub, role]).toEqual([method, sub, reads ? 'reviewer' : 'dev']);
    }
  });
});
