// The hosted Studio's page and the game's live preview (4.2.1 PR 7, plan §3.4, §6.1, §6.2): on the Studio's origin,
// the built page (with the meta tag that says where its API and the game are, and a Content-Security-Policy that
// frames the game's origin only), its files, and the game's images for members only; on the game's origin, the
// game's page and code through Vite, behind a game session, with nothing else of the engine's folder, nor the game's
// private notes, nor any Studio API. Two origins on one server: the Studio at 127.0.0.1, the game at localhost.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { StudioClient } from '../studio-server/src/server/client';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Play, PLAY_COOKIE } from '../studio-server/src/server/play';
import { type LivePreview, livePreview, servedPath } from '../studio-server/src/server/preview';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp } from './fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, studioUrl: string, playUrl: string, op: TestOp, stop: () => Promise<void>, gameDir: string;
let lea = '';
let sam = '';

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
const setCookie = (r: Response, name: string) => r.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const cookieValue = (c: string | undefined, name: string) => c?.split(';')[0]!.slice(name.length + 1);

async function login(sub: string, email: string, invite?: string): Promise<string> {
  op.user = { sub, email, emailVerified: true, name: sub };
  const r1 = await fetch(`${studioUrl}/auth/login?${new URLSearchParams(invite ? { invite } : {})}`, {
    redirect: 'manual',
  });
  const pre = cookieValue(setCookie(r1, '__Host-ws_pre'), '__Host-ws_pre')!;
  const r2 = await fetch(r1.headers.get('location')!, { redirect: 'manual' });
  const r3 = await fetch(r2.headers.get('location')!, {
    redirect: 'manual',
    headers: { cookie: `__Host-ws_pre=${pre}` },
  });
  return cookieValue(setCookie(r3, '__Host-ws_session'), '__Host-ws_session')!;
}
const asStudio = (cookie: string | undefined, path: string) =>
  fetch(`${studioUrl}${path}`, { headers: cookie ? { cookie: `__Host-ws_session=${cookie}` } : {} });
/** A game session on the game's origin, opened with a ticket of `cookie`'s Studio session. */
async function gameSession(cookie: string, path = '/') {
  const t = await fetch(`${studioUrl}/api/play-ticket`, {
    method: 'POST',
    headers: {
      cookie: `__Host-ws_session=${cookie}`,
      origin: studioUrl,
      'x-studio-request': '1',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  const r = await fetch(((await t.json()) as { url: string }).url, { redirect: 'manual' });
  return cookieValue(setCookie(r, PLAY_COOKIE), PLAY_COOKIE)!;
}
const asGame = (session: string | undefined, path: string, method = 'GET') =>
  fetch(`${playUrl}${path}`, { method, headers: session ? { cookie: `${PLAY_COOKIE}=${session}` } : {} });

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-client-'));
  op = await new TestOp().start();
  gameDir = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), gameDir, { recursive: true });
  mkdirSync(join(gameDir, 'private'), { recursive: true });
  writeFileSync(join(gameDir, 'private', 'secret.ts'), 'export const s = "private";\n');
  // A built Studio and a public folder of the test's own.
  const clientDir = join(tmp, 'client');
  mkdirSync(join(clientDir, 'assets', 'tools'), { recursive: true });
  writeFileSync(
    join(clientDir, 'studio.html'),
    '<!doctype html><html><head><title>Studio</title></head><body></body></html>',
  );
  writeFileSync(join(clientDir, 'assets', 'tools', 'studio-abc.js'), 'export {};\n');
  writeFileSync(join(clientDir, 'assets', 'notes.txt'), 'not a Studio file\n');
  const publicDir = join(tmp, 'public');
  mkdirSync(join(publicDir, 'assets', 'img', 'decor'), { recursive: true });
  mkdirSync(join(publicDir, 'icons'), { recursive: true });
  writeFileSync(join(publicDir, 'assets', 'img', 'decor', 'hall.webp'), 'RIFF....WEBP');
  writeFileSync(join(publicDir, 'icons', 'icon-192.png'), 'png');
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir });
  const lease = new ServiceLease(db);
  await lease.tick();
  const port = await freePort();
  studioUrl = `http://127.0.0.1:${port}`;
  playUrl = `http://localhost:${port}`;
  const oidc = await Oidc.discover({
    issuer: op.issuer,
    clientId: op.clientId,
    clientSecret: op.clientSecret,
    audience: op.audience,
    allowInsecure: true,
  });
  const sealer = new Sealer(['a-session-key-of-at-least-32-characters']);
  const store = new AuthStore(db);
  const gate = new Gate({ store, oidc, sealer, publicUrl: studioUrl });
  const preview: LivePreview = await livePreview({
    gameDir,
    game: 'template',
    publicDir,
    studioOrigin: studioUrl,
    engineRoot: ROOT,
  });
  const server = studioServer({
    studio: createStudio({ gameDir, root: tmp, journal, importFresh: importInChild }),
    journal,
    db,
    lease,
    log: () => {},
    perMinute: 10_000,
    auth: { gate, handle: authRoutes({ gate, store, oidc, sealer, publicUrl: studioUrl, send, readJson }) },
    play: {
      playUrl,
      handler: new Play({
        db,
        store,
        publicUrl: studioUrl,
        playUrl,
        idleMs: gate.idleMs,
        content: (req, res) => preview.handle(req, res),
      }),
    },
    client: new StudioClient({ clientDir, publicDir, publicUrl: studioUrl, playUrl }),
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  lea = await login('u-lea', 'lea@example.org', await store.invite('lea@example.org', 'reviewer', 'test'));
  sam = await login('u-sam', 'sam@example.org');
  stop = async () => {
    server.close();
    op.stop();
    await preview.close();
    await journal.close();
    await db.close();
  };
}, 120_000);
afterAll(async () => {
  await stop();
  rmSync(tmp, { recursive: true, force: true });
});

describe("the Studio's page", () => {
  it('is served to anyone, says where its API and the game are, and frames the game only', async () => {
    const r = await asStudio(undefined, '/');
    expect(r.status).toBe(200);
    const html = await r.text();
    const meta = /<meta name="web-scumm-studio" content="([^"]*)">/.exec(html)?.[1];
    expect(JSON.parse(meta!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))).toEqual({
      hosted: true,
      api: '/api',
      play: playUrl,
    });
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain(`frame-src ${playUrl}`);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('serves its built scripts for good, its icon, and nothing else of the folders', async () => {
    const js = await asStudio(undefined, '/assets/tools/studio-abc.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await asStudio(undefined, '/icons/icon-192.png')).status).toBe(200);
    for (const p of [
      '/assets/notes.txt',
      '/assets/tools/../../j.sqlite',
      '/studio.html',
      '/index.html',
      '/src/main.ts',
    ])
      expect((await asStudio(undefined, p)).status, p).toBe(404);
  });

  it("serves the game's images to members only", async () => {
    expect((await asStudio(undefined, '/assets/img/decor/hall.webp')).status).toBe(401);
    // Logged in, but not a member: nothing.
    expect((await asStudio(sam, '/assets/img/decor/hall.webp')).status).toBe(403);
    const r = await asStudio(lea, '/assets/img/decor/hall.webp');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await asStudio(lea, '/assets/img/decor/none.webp')).status).toBe(404);
  });
});

describe("the game's live preview", () => {
  it("serves the game's page and code to a game session, naming the Studio's origin", async () => {
    const s = await gameSession(lea, '/?edit=hall');
    expect((await asGame(undefined, '/')).status).toBe(401);
    const page = await asGame(s, '/');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`<meta name="web-scumm-studio-origin" content="${studioUrl}"`);
    expect(page.headers.get('content-security-policy')).toBe(`frame-ancestors ${studioUrl}`);
    expect((await asGame(s, '/src/main.ts')).status).toBe(200);
    // Vite's client is a stub that connects nowhere, and still sets the build's constants.
    const client = await (await asGame(s, '/@vite/client')).text();
    expect(client).toContain("import '/@vite/env'");
    expect(client).not.toContain('WebSocket');
    // The game's own code, by its absolute path.
    const game = await asGame(s, `/@fs${resolve(gameDir, 'index.ts')}`);
    expect(game.status).toBe(200);
    expect(game.headers.get('content-type')).toMatch(/javascript/);
  }, 60_000);

  it('serves nothing else: no Studio API, no engine file outside its sources, no private note, no write', async () => {
    const s = await gameSession(lea);
    for (const p of [
      '/api/game',
      '/__studio/api/game',
      '/auth/me',
      '/package.json',
      '/tools/game.ts',
      '/studio-server/src/server/main.ts',
      '/@fs/etc/passwd',
      `/@fs${resolve(gameDir, 'private', 'secret.ts')}`,
      `/@fs${resolve(ROOT, 'package.json')}`,
      '/src/../package.json',
      '/%2e%2e/package.json',
    ])
      expect((await asGame(s, p)).status, p).toBe(404);
    expect((await asGame(s, '/', 'POST')).status).toBe(405);
  }, 60_000);
});

describe('the paths the preview lets through', () => {
  const o = {
    root: '/srv/engine',
    allowed: ['/srv/engine/src', '/srv/work/game', '/srv/engine/node_modules'],
    gameDir: '/srv/work/game',
    hidden: ['/srv/work/game/private'],
  };
  it('lets the page, the engine, the dependencies and the game through', () => {
    for (const p of [
      '/',
      '/index.html',
      '/src/main.ts',
      '/@vite/client',
      '/@vite/env',
      '/@id/__x00__studio-no-sw',
      '/node_modules/.vite/studio-preview/deps/howler.js',
      '/node_modules/vite/dist/client/env.mjs',
      '/assets/img/decor/hall.webp',
      '/@fs/srv/work/game/index.ts',
    ])
      expect(servedPath(p, o), p).toBe(true);
  });
  it('keeps out what a game page never loads', () => {
    for (const p of [
      '/package.json',
      '/node_modules/vite/package.json',
      '/node_modules/vite/dist/client/client.mjs',
      '/@fs/srv/work/game/private/notes.ts',
      '/@fs/srv/work/other/x.ts',
      '/@fs/etc/passwd',
      '/src/../package.json',
      '/%E0%A4%A',
      '/src/a\0b',
      '/src\\..\\x',
    ])
      expect(servedPath(p, o), p).toBe(false);
  });
  it("lets a game folder under the engine's through by its path from the root, its private notes excepted", () => {
    const inRoot = { ...o, gameDir: '/srv/engine/.cache/work/game', hidden: ['/srv/engine/.cache/work/game/private'] };
    expect(servedPath('/.cache/work/game/index.ts', inRoot)).toBe(true);
    expect(servedPath('/.cache/work/game/private/x.ts', inRoot)).toBe(false);
    expect(servedPath('/.cache/work/other.ts', inRoot)).toBe(false);
  });
});
