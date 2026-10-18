// The hosted Studio in a browser (4.2.1 PR 7, plan §6.1 and §11): a Studio Server with a test OpenID provider, the
// built Studio's page (`npm run studio-client` first) on one origin and the game's live preview on another (two names
// of the loopback: 127.0.0.1 and localhost, two sites). A member logs in through the provider and the Studio loads;
// the Rooms tab shows the room's editor from the game's origin; "Save layout" asks the editor for its layout and the
// Studio writes it (a new revision); a layout the editor sends unasked is ignored; the game's page cannot read the
// Studio's page nor call its API with the member's session; the Play tab runs the game there; after the logout the
// game's origin refuses the next request. WebKit keeps no `Secure` cookie over http, even on the loopback: with it
// the two origins are served over https with a certificate made for the run (openssl), which the browser is told to
// accept. Usage: tsx scripts/e2e-studio-hosted.ts [--browser=webkit] [--https]. Exit 0 / 1.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium, type Frame, type Page, webkit } from 'playwright';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { spansOf } from '../studio-server/src/ops/spans';
import { Gate } from '../studio-server/src/server/auth/gate';
import { Oidc } from '../studio-server/src/server/auth/oidc';
import { authRoutes } from '../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../studio-server/src/server/auth/store';
import { StudioClient } from '../studio-server/src/server/client';
import { readJson, send, studioServer } from '../studio-server/src/server/http';
import { Leases } from '../studio-server/src/server/leases';
import { Presence } from '../studio-server/src/server/live';
import { Play } from '../studio-server/src/server/play';
import { livePreview } from '../studio-server/src/server/preview';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { TestOp } from '../tests/fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..');
const CLIENT = join(ROOT, '.cache', 'studio-client');
const engine = process.argv.includes('--browser=webkit') ? webkit : chromium;
const tls = engine === webkit || process.argv.includes('--https');
if (!existsSync(join(CLIENT, 'studio.html'))) {
  console.error('✖ no built Studio: run `npm run studio-client` first');
  process.exit(1);
}

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });

mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'e2e-studio-hosted-'));
const gameDir = join(tmp, 'game');
cpSync(join(ROOT, 'games', 'demo'), gameDir, { recursive: true });
const op = await new TestOp().start();
const port = await freePort();
const scheme = tls ? 'https' : 'http';
const studioUrl = `${scheme}://127.0.0.1:${port}`;
const playUrl = `${scheme}://localhost:${port}`;
const db = await openSqliteDb(join(tmp, 'j.sqlite'));
const leases = new Leases(db);
const journal = await Journal.open({
  db,
  blobs: fsBlobStore(join(tmp, 'blobs')),
  gameDir,
  claim: async (q, paths) => {
    const who = operationContext.getStore()?.claimant;
    if (!who) throw new StudioError('a write on a shared Studio says who writes', 500);
    await leases.claimPaths(q, who, paths);
  },
  precheck: async (paths) => {
    const who = operationContext.getStore()?.claimant;
    if (who) await leases.check(who, spansOf(paths));
  },
});
const lease = new ServiceLease(db);
await lease.tick();
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
const preview = await livePreview({
  gameDir,
  game: 'demo',
  publicDir: join(ROOT, 'public'),
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
  leases,
  presence: new Presence(),
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
  client: new StudioClient({ clientDir: CLIENT, publicDir: join(ROOT, 'public'), publicUrl: studioUrl, playUrl }),
});
let front: { close(): void } = server;
if (tls) {
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost']
      .concat(['-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'])
      .concat(['-keyout', join(tmp, 'key.pem'), '-out', join(tmp, 'cert.pem')]),
    { stdio: 'ignore' },
  );
  const https = createHttpsServer(
    { key: readFileSync(join(tmp, 'key.pem')), cert: readFileSync(join(tmp, 'cert.pem')) },
    (req, res) => server.emit('request', req, res),
  );
  await new Promise<void>((ok) => https.listen(port, '127.0.0.1', ok));
  front = https;
} else await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));

const steps: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  steps.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const browser = await engine.launch();
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: tls });
  if (process.env.E2E_DEBUG)
    await context.addInitScript(() => {
      addEventListener('error', (e) => console.log('frame-error', location.host, e.message));
      addEventListener('unhandledrejection', (e) =>
        console.log('frame-rejection', location.host, String(e.reason?.stack ?? e.reason)),
      );
    });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.E2E_DEBUG) {
    page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)));
    page.on('response', (r) => r.url().includes('localhost') && console.log('http', r.status(), r.url().slice(0, 160)));
    page.on('requestfailed', (r) => console.log('failed', r.url().slice(0, 160), r.failure()?.errorText));
    const open = new Set<string>();
    page.on('request', (r) => open.add(r.url()));
    page.on('requestfinished', (r) => open.delete(r.url()));
    page.on('requestfailed', (r) => open.delete(r.url()));
    setTimeout(
      () =>
        console.log(
          'pending',
          [...open].map((u) => u.slice(0, 160)),
        ),
      45_000,
    ).unref();
  }

  // 1. The login: the invitation, the provider, back to the Studio.
  const invite = await store.invite(op.user.email, 'owner', 'e2e');
  await page.goto(`${studioUrl}/auth/login?invite=${invite}&returnTo=${encodeURIComponent('/#rooms/garden')}`);
  await page.locator('header.top .game').waitFor({ timeout: 30_000 });
  check('the member logs in and the Studio loads', (await page.locator('header.top .game').innerText()).length > 0);
  check('no undo on a shared Studio', (await page.getByRole('button', { name: /^Undo/ }).count()) === 0);

  // 2. Rooms: the editor comes from the game's origin.
  const editor = page.frameLocator('iframe.engine');
  await editor.locator('svg').first().waitFor({ timeout: 60_000 });
  const frame = page.frames().find((f) => f.url().startsWith(playUrl)) as Frame | undefined;
  check('the room editor is on the game origin', !!frame, frame?.url().split('?')[0]);
  if (!frame) throw new Error('no editor frame');

  // 3. A save asked by the Studio is written by the Studio, through its API, as the member.
  const puts: number[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'PUT' && r.url() === `${studioUrl}/api/room/garden/layout`) puts.push(r.status());
  });
  await page.getByRole('button', { name: 'Save layout' }).click();
  for (let i = 0; i < 40 && !puts.length; i++) await page.waitForTimeout(250);
  check('"Save layout" has the Studio write the editor\'s layout', puts[0] === 200, `PUT ${puts.join(', ')}`);

  // 4. A layout sent unasked (no nonce) is ignored.
  const n = puts.length;
  await frame.evaluate((studio) => {
    window.parent.postMessage(
      { source: 'web-scumm-editor', type: 'saved', room: 'garden', ok: true, layout: { entries: { default: [1, 1] } } },
      studio,
    );
  }, studioUrl);
  await page.waitForTimeout(1500);
  check('a layout the editor sends unasked is ignored', puts.length === n);

  // 5. The game's page cannot reach the Studio.
  const reach = await frame.evaluate(async (studio) => {
    let parent = 'readable';
    try {
      void window.parent.document.title;
    } catch {
      parent = 'blocked';
    }
    let api = 'answered';
    try {
      const r = await fetch(`${studio}/api/game`, { credentials: 'include' });
      api = `status ${r.status}`;
    } catch {
      api = 'blocked';
    }
    let write = 'answered';
    try {
      const r = await fetch(`${studio}/api/room/garden/layout`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
        body: '{}',
      });
      write = `status ${r.status}`;
    } catch {
      write = 'blocked';
    }
    return { parent, api, write };
  }, studioUrl);
  check("the game's page cannot read the Studio's page", reach.parent === 'blocked');
  check(
    "the game's page cannot read the Studio's API",
    reach.api === 'blocked' || reach.api === 'status 401',
    reach.api,
  );
  check("the game's page cannot write through the Studio's API", reach.write === 'blocked', reach.write);

  // 6. Play: the game runs on its origin.
  await page.getByRole('tab', { name: 'Play' }).click();
  const play = page.frameLocator('iframe.playframe');
  await play.locator('#app *').first().waitFor({ timeout: 60_000 });
  const playFrame = page.frames().find((f) => f.url().startsWith(playUrl) && f !== frame);
  check('the Play tab runs the game on its origin', !!playFrame);

  // 7. The logout ends the game's session too.
  await page.evaluate(async () => {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-request': '1' },
      body: '{}',
    });
  });
  const afterLogout = await playFrame!.evaluate(async () => (await fetch('/src/main.ts')).status);
  check(
    "after the logout, the game's origin refuses the next request",
    afterLogout === 403 || afterLogout === 401,
    `status ${afterLogout}`,
  );
  // WebKit reports the probe's refused fetches of step 5 as page errors: those, and only those, are expected.
  const unexpected = errors.filter((e) => !/\/api\/(game|room\/garden\/layout) due to access control checks/.test(e));
  check('no page error in the Studio', unexpected.length === 0, unexpected.join(' | '));
} catch (e) {
  check('the run', false, (e as Error).message.split('\n')[0]);
  if (process.env.E2E_DEBUG) {
    for (const p of browser.contexts().flatMap((c) => c.pages())) {
      for (const f of p.frames())
        console.log(
          'frame',
          f.url(),
          await f.evaluate(() => document.body?.innerHTML.slice(0, 1500)).catch((e) => String(e)),
        );
      await p.screenshot({ path: join(ROOT, '.cache', 'e2e-studio-hosted.png') });
    }
  }
} finally {
  failed = steps.some(([, ok]) => !ok);
  await browser.close();
  front.close();
  op.stop();
  await preview.close();
  await lease.release();
  await journal.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? '✖ e2e:studio-hosted failed' : '✓ e2e:studio-hosted');
process.exit(failed ? 1 : 0);
