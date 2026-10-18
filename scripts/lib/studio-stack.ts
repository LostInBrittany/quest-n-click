// A whole hosted Studio for the browser e2e (4.2.1 PR 7): a test OpenID provider, the Studio Server with its journal,
// leases and presence, the built Studio's page on one origin and the game's live preview on another (two names of the
// loopback: 127.0.0.1 and localhost, two sites). `tls`: both over https with a certificate made for the run (WebKit
// keeps no `Secure` cookie over http, even on the loopback). People are named: `invite` makes an invitation for one
// and has the provider log them in next; `as` makes the provider log in someone else next.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { openSqliteDb } from '../../bridge/src/store-sqlite';
import { fsBlobStore } from '../../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../../studio-server/src/ops/core';
import { StudioError } from '../../studio-server/src/ops/errors';
import { Journal } from '../../studio-server/src/ops/journal';
import { spansOf } from '../../studio-server/src/ops/spans';
import { Gate } from '../../studio-server/src/server/auth/gate';
import { Oidc } from '../../studio-server/src/server/auth/oidc';
import { authRoutes } from '../../studio-server/src/server/auth/routes';
import { AuthStore, Sealer } from '../../studio-server/src/server/auth/store';
import { StudioClient } from '../../studio-server/src/server/client';
import { readJson, send, studioServer } from '../../studio-server/src/server/http';
import { Leases } from '../../studio-server/src/server/leases';
import { Presence } from '../../studio-server/src/server/live';
import { Play } from '../../studio-server/src/server/play';
import { livePreview } from '../../studio-server/src/server/preview';
import { ServiceLease } from '../../studio-server/src/server/service-lease';
import { TestOp, type TestUser } from '../../tests/fixtures/oidc-op';

const ROOT = join(import.meta.dirname, '..', '..');
const CLIENT = join(ROOT, '.cache', 'studio-client');

const PEOPLE: Record<string, TestUser> = {
  lea: { sub: 'u-lea', email: 'lea@example.org', emailVerified: true, name: 'Léa' },
  tom: { sub: 'u-tom', email: 'tom@example.org', emailVerified: true, name: 'Tom' },
  ali: { sub: 'u-ali', email: 'ali@example.org', emailVerified: true, name: 'Ali' },
  sam: { sub: 'u-sam', email: 'sam@example.org', emailVerified: true, name: 'Sam' },
};

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });

export async function startStack(o: { tls: boolean; game?: string }) {
  if (!existsSync(join(CLIENT, 'studio.html'))) throw new Error('no built Studio: run `npm run studio-client` first');
  const tls = o.tls;
  const game = o.game ?? 'demo';
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const tmp = mkdtempSync(join(ROOT, '.cache', 'e2e-studio-hosted-'));
  const gameDir = join(tmp, 'game');
  cpSync(join(ROOT, 'games', game), gameDir, { recursive: true });
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
    game,
    publicDir: join(ROOT, 'public'),
    studioOrigin: studioUrl,
    playUrl,
    engineRoot: ROOT,
  });
  // As the server does (main.ts): the preview reads the folder again after each revision.
  journal.events.on('confirmed', () => preview.invalidate());
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

  return {
    tls,
    studioUrl,
    playUrl,
    store,
    journal,
    /** An invitation for `who` with `role`; the provider logs them in next. */
    invite(who: string, role: 'owner' | 'dev' | 'reviewer') {
      op.user = PEOPLE[who]!;
      return store.invite(PEOPLE[who]!.email, role, 'e2e');
    },
    /** The provider logs `who` in next. */
    as(who: string) {
      op.user = PEOPLE[who]!;
    },
    /** Cuts every open connection (a network cut, a proxy restarting): the browsers reconnect by themselves. */
    cut() {
      (front as { closeAllConnections?: () => void }).closeAllConnections?.();
    },
    async stop() {
      front.close();
      op.stop();
      await preview.close();
      await lease.release();
      await journal.close();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
