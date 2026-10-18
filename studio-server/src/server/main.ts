// studio-server <command> --config <file> (4.2.1, plan §4 and §7 row 4):
//   serve          the Studio Server: the API, the probes, the service lease
//   import <dir>   a game folder becomes the instance's project (the journal adopts it; hosted: its files go to the blobs)
//   export <dir>   the game at the head, written to a folder, with a manifest of the hashes and the revision
//   invite --email <e> --role <owner|dev|reviewer>   a one-time invitation link (the first owner comes this way)
//   login --server <url>, token --server <url>       the CLI's device flow, and its current access token
//   deps           its own dependencies (OpenID Connect, JWT, Postgres): the version and folder each resolves to
// Secrets come from `<NAME>_FILE` or the environment (config.ts) and leave `process.env` before anything else runs.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqliteDb } from '../../../bridge/src/store-sqlite';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { createStudio, operationContext } from '../ops/core';
import { StudioError } from '../ops/errors';
import { spansOf } from '../ops/spans';
import { type BlobStore, fsBlobStore } from '../ops/blobs';
import { sha256 } from '../ops/durable';
import { Journal } from '../ops/journal';
import { ConfigError, loadConfig, type StudioServerConfig, takeSecrets } from './config';
import { accessToken, deviceLogin } from './auth/device';
import { Gate } from './auth/gate';
import { Oidc } from './auth/oidc';
import { authRoutes } from './auth/routes';
import { AuthStore, Sealer } from './auth/store';
import { readJson, send, studioServer } from './http';
import { openPostgresDb } from './postgres';
import { newJobKeys } from '../worker/job';
import { packSnapshot } from '../worker/snapshot';
import { assetsVersion } from '../../../tools/vite/plugins';
import { Leases } from './leases';
import { Presence } from './live';
import { StudioClient } from './client';
import { Play } from './play';
import { HOSTED_SOLVE_MS } from '../ops/diagnose';
import type { SolveData } from '../../../tools/studio/types';
import { Health, judgeBy } from './health';
import { Previews } from './previews';
import { remoteExecutor } from './remote-executor';
import { S3, s3BlobStore } from './s3';
import { ServiceLease } from './service-lease';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

async function openAll(config: StudioServerConfig) {
  const secrets = takeSecrets();
  let db: SqlDb;
  if (config.store.kind === 'postgres') {
    if (!secrets.STUDIO_DATABASE_URL)
      throw new ConfigError('STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required');
    db = await openPostgresDb(secrets.STUDIO_DATABASE_URL);
  } else db = await openSqliteDb(resolve(config.store.file!));
  let blobs: BlobStore;
  let s3: S3 | undefined;
  if (config.blobs.kind === 's3') {
    if (!secrets.STUDIO_S3_KEY_ID || !secrets.STUDIO_S3_KEY_SECRET)
      throw new ConfigError('STUDIO_S3_KEY_ID and STUDIO_S3_KEY_SECRET (or the Cellar add-on variables) are required');
    const endpoint = /^https?:\/\//.test(config.blobs.host!) ? config.blobs.host! : `https://${config.blobs.host}`;
    s3 = new S3({
      endpoint,
      bucket: config.blobs.bucket!,
      keyId: secrets.STUDIO_S3_KEY_ID,
      secret: secrets.STUDIO_S3_KEY_SECRET,
    });
    blobs = s3BlobStore(s3);
  } else blobs = fsBlobStore(resolve(config.blobs.dir!));
  const gameDir = resolve(config.workDir, 'game');
  mkdirSync(gameDir, { recursive: true });
  return { db, blobs, gameDir, secrets, s3 };
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  // The CLI's own commands (plan §3.5): no configuration, a server's URL.
  if (cmd === 'login' || cmd === 'token') {
    const server = rest[rest.indexOf('--server') + 1];
    if (rest.indexOf('--server') < 0 || !server) {
      console.error(`usage: studio-server ${cmd} --server <https://studio.example>`);
      return 2;
    }
    if (cmd === 'login') {
      await deviceLogin(server, {
        tell: (url, code) => console.log(`Open ${url} and enter the code ${code}`),
      });
      console.log('logged in');
    } else console.log(await accessToken(server));
    return 0;
  }
  // What the server runs with (4.2.1): its own dependencies as they resolve from here, by version and file (the
  // package's install smoke reads it; a missing one fails here, not at the first login).
  if (cmd === 'deps') {
    const out: Record<string, { version: string; from: string }> = {};
    for (const name of ['openid-client', 'jose', 'pg']) {
      const url = import.meta.resolve(name);
      await import(name);
      let dir = fileURLToPath(url);
      while (
        !existsSync(join(dir, 'package.json')) ||
        JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== name
      )
        dir = resolve(dir, '..');
      out[name] = { version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, from: dir };
    }
    console.log(JSON.stringify(out));
    return 0;
  }
  // The job keys (ADR 0028): the private one is the Studio's secret STUDIO_WORKER_KEY, the public one the worker's
  // WORKER_PUBLIC_KEY. Written to files, the private one 0600; never printed.
  if (cmd === 'worker-keys') {
    const out = resolve(rest[rest.indexOf('--out') + 1] ?? '');
    if (rest.indexOf('--out') < 0 || !existsSync(out)) {
      console.error('usage: studio-server worker-keys --out <existing folder>');
      return 2;
    }
    const k = newJobKeys();
    writeFileSync(join(out, 'studio-worker.key'), k.privatePem, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(out, 'studio-worker.pub'), k.publicPem, { flag: 'wx' });
    console.log(
      `written: ${join(out, 'studio-worker.key')} (0600, the Studio's), ${join(out, 'studio-worker.pub')} (the worker's)`,
    );
    return 0;
  }
  const at = rest.indexOf('--config');
  const inline = at < 0 ? process.env.STUDIO_CONFIG_JSON : undefined;
  const file = at >= 0 ? rest[at + 1] : (process.env.STUDIO_CONFIG ?? (inline ? 'STUDIO_CONFIG_JSON' : undefined));
  if (!cmd || !file) {
    console.error('usage: studio-server <serve|import <dir>|export <dir>> --config <file> (or STUDIO_CONFIG_JSON)');
    return 2;
  }
  const args = rest.filter((_, i) => i !== at && i !== at + 1);
  const config = loadConfig(file, process.env.STUDIO_CONFIG ? undefined : inline);
  const { db, blobs, gameDir, secrets, s3 } = await openAll(config);
  const hosted = config.store.kind === 'postgres';

  if (cmd === 'import') {
    const from = args[0] && resolve(args[0]);
    if (!from || !existsSync(join(from, 'index.ts'))) {
      console.error('import: a game folder (with its index.ts) is required');
      return 2;
    }
    // The database decides whether the instance already has a project, not its (possibly new) disk.
    const [had] = await db.all('SELECT path FROM studio_files LIMIT 1').catch(() => [] as Record<string, unknown>[]);
    if (had || readdirSync(gameDir).length) {
      console.error('import: this instance already has a project');
      return 1;
    }
    // Copied beside, then renamed into place: a crash during the copy leaves no half game to adopt.
    const staging = `${gameDir}.import-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    cpSync(from, staging, { recursive: true });
    rmSync(gameDir, { recursive: true, force: true });
    renameSync(staging, gameDir);
    // Opening adopts the folder as one operation (and, hosted, stores every file in the blobs).
    const j = await Journal.open({ db, blobs, gameDir, hosted });
    console.log(JSON.stringify({ event: 'imported', game: config.game, revision: await j.revision() }));
    await j.close();
    return 0;
  }

  // A shared Studio (OIDC): every write claims the spans of its files, in the transaction of its intent (P2).
  const leases = config.oidc ? new Leases(db) : undefined;
  const journal = await Journal.open({
    db,
    blobs,
    gameDir,
    hosted,
    // A write that names nobody is refused: a route or a job that wrote outside a request would bypass the leases.
    claim: leases
      ? async (q, paths) => {
          const who = operationContext.getStore()?.claimant;
          if (!who) throw new StudioError('a write on a shared Studio says who writes', 500);
          await leases.claimPaths(q, who, paths);
        }
      : undefined,
    precheck: leases
      ? async (paths) => {
          const who = operationContext.getStore()?.claimant;
          if (who) await leases.check(who, spansOf(paths));
        }
      : undefined,
  });

  if (cmd === 'export') {
    const out = args[0] && resolve(args[0]);
    if (!out || (existsSync(out) && readdirSync(out).length)) {
      console.error('export: an empty or new folder is required');
      return 2;
    }
    // One snapshot of the head: the files and the revision the manifest names belong together.
    const head = await db.tx(
      undefined,
      async (q) => ({
        files: (await q.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map((r) => ({
          path: String(r.path),
          blob: String(r.blob),
        })),
        revision: Number((await q.all("SELECT value FROM studio_meta WHERE key = 'revision'"))[0]?.value ?? 0),
      }),
      { readOnly: true },
    );
    const files = head.files;
    for (const f of files) {
      const bytes = (await blobs.has(f.blob)) ? await blobs.get(f.blob) : undefined;
      const target = join(out, ...f.path.split('/'));
      mkdirSync(join(target, '..'), { recursive: true });
      // A local journal keeps blobs only for what it wrote: the rest is read from the game folder, checked.
      const data = bytes ?? readFileSync(join(gameDir, ...f.path.split('/')));
      if (sha256(data) !== f.blob) throw new Error(`${f.path}: the content does not match the head`);
      writeFileSync(target, data);
    }
    const manifest = { game: config.game, epoch: await journal.epoch(), revision: head.revision, files };
    writeFileSync(join(out, 'export-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(JSON.stringify({ event: 'exported', revision: manifest.revision, files: files.length }));
    await journal.close();
    return 0;
  }

  if (cmd === 'invite') {
    const email = args[args.indexOf('--email') + 1];
    const role = args[args.indexOf('--role') + 1];
    if (args.indexOf('--email') < 0 || !email || !['owner', 'dev', 'reviewer'].includes(role ?? '')) {
      console.error('usage: studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>');
      return 2;
    }
    const token = await new AuthStore(db).invite(email, role as 'owner', 'studio-server invite');
    console.log(`${config.publicUrl}/auth/login?invite=${token}`);
    await journal.close();
    return 0;
  }

  if (cmd !== 'serve') {
    console.error(`unknown command: ${cmd}`);
    return 2;
  }
  // Without OIDC the server is the local one: the loopback only.
  if (!config.oidc && !LOOPBACK.has(config.host)) {
    console.error(`serve: ${config.host} is refused without authentication (configure oidc); use 127.0.0.1`);
    return 2;
  }
  let auth: Parameters<typeof studioServer>[0]['auth'];
  let authStore: AuthStore | undefined;
  if (config.oidc) {
    if (!secrets.STUDIO_OIDC_CLIENT_SECRET) throw new ConfigError('STUDIO_OIDC_CLIENT_SECRET is required');
    if (!secrets.STUDIO_SESSION_KEY) throw new ConfigError('STUDIO_SESSION_KEY is required (32 characters or more)');
    const oidc = await Oidc.discover({ ...config.oidc, clientSecret: secrets.STUDIO_OIDC_CLIENT_SECRET });
    const sealer = new Sealer(secrets.STUDIO_SESSION_KEY.split(',').map((k) => k.trim()));
    const store = new AuthStore(db);
    authStore = store;
    const gate = new Gate({
      store,
      oidc,
      sealer,
      publicUrl: config.publicUrl,
      ...(config.sessions?.idleHours ? { idleMs: config.sessions.idleHours * 3_600_000 } : {}),
      ...(config.sessions?.absoluteHours ? { absoluteMs: config.sessions.absoluteHours * 3_600_000 } : {}),
    });
    auth = {
      gate,
      audit: (actor, event, detail) => store.audit(actor, event, detail),
      handle: authRoutes({
        gate,
        store,
        oidc,
        sealer,
        publicUrl: config.publicUrl,
        cliClientId: config.oidc.cliClientId,
        send,
        readJson,
      }),
    };
  }
  const lease = new ServiceLease(db);
  lease.start((held) =>
    console.log(JSON.stringify({ event: held ? 'lease-taken' : 'lease-lost', instance: lease.instance })),
  );
  // With OIDC, the game's code runs in the processing worker only (ADR 0028); without, this is the local server.
  let executor: ReturnType<typeof remoteExecutor> | undefined;
  if (config.worker) {
    if (!secrets.STUDIO_WORKER_KEY)
      throw new ConfigError('STUDIO_WORKER_KEY (the Ed25519 key that signs jobs) is required');
    executor = remoteExecutor({
      s3: s3!,
      workerUrl: config.worker.url,
      // A variable cannot always hold line breaks: `\n` written out is read as one.
      privateKeyPem: secrets.STUDIO_WORKER_KEY.replace(/\\n/g, '\n'),
      instance: config.worker.instance,
      at: async () => ({ epoch: await journal.epoch(), rev: await journal.revision() }),
    });
  }
  const studio = createStudio({ gameDir, root: resolve(config.workDir), journal, author: 'studio-server', executor });
  const presence = leases ? new Presence() : undefined;
  // The engine's folder: the built Studio and the prepared assets are found beside it unless configured.
  const engineRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const publicDir = resolve(config.publicDir ?? join(engineRoot, 'public'));
  // The page: configured, else the one the package was built with (web-scumm-studio-server), else this checkout's.
  const clientDir = resolve(
    config.clientDir ?? process.env.WEB_SCUMM_STUDIO_CLIENT ?? join(engineRoot, '.cache', 'studio-client'),
  );
  // The Studio's page (PR 7): required with OIDC, where it is the only way in; optional on the loopback.
  let client: StudioClient | undefined;
  if (existsSync(join(clientDir, 'studio.html')))
    client = new StudioClient({ clientDir, publicDir, publicUrl: config.publicUrl, playUrl: config.playUrl });
  else if (config.oidc)
    throw new ConfigError(`${clientDir} has no studio.html: build the Studio's page first (npm run studio-client)`);
  // The game's origin (plan §6.1): the revisions' previews, built by the worker, behind a game session (4.2.2 PR 2).
  // The snapshot is packed holding the instance's lock, from the folder repaired to the head first: no write lands
  // between reading the head and packing it, and the folder (a cache) has not drifted from it. The prepared assets are
  // read only on a hosted Studio: their version is computed once, at the first build.
  let version: string | undefined;
  const previews =
    auth && authStore && executor
      ? new Previews({
          db,
          blobs,
          publicDir,
          game: config.game,
          studioOrigin: config.publicUrl,
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
            }),
          build: (bytes, params, at) => executor!.preview(bytes, params, at),
          assetsVersion: () => (version ??= assetsVersion(join(publicDir, 'assets'))),
          log: (line) => console.log(JSON.stringify(line)),
        })
      : undefined;
  // After each revision, the head's preview (coalesced: a burst builds its last revision only).
  journal.events.on('confirmed', () => void previews?.schedule());
  // And its health (G3, G4): the validator's verdict by revision, a bisection when the head breaks.
  const health = executor
    ? new Health({
        db,
        journal,
        snapshot: () =>
          server.exclusive(async () => {
            await journal.reconcile();
            return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
          }),
        judge: judgeBy({
          validate: (bytes, at) => executor!.validateSnapshot(bytes, at),
          solve: (bytes, at) =>
            executor!.diagnoseSnapshot(
              'solve',
              bytes,
              { from: null, maxStates: 20_000, mode: 'witness', timeLimitMs: HOSTED_SOLVE_MS },
              at,
            ) as Promise<SolveData>,
        }),
        log: (line) => console.log(JSON.stringify(line)),
      })
    : undefined;
  journal.events.on('confirmed', () => void health?.schedule());
  const play =
    auth && authStore && previews
      ? {
          playUrl: config.playUrl,
          handler: new Play({
            db,
            store: authStore,
            publicUrl: config.publicUrl,
            playUrl: config.playUrl,
            idleMs: auth.gate.idleMs,
            content: (req, res, url) => previews.handle(req, res, url),
          }),
        }
      : undefined;
  const server = studioServer({
    studio,
    journal,
    db,
    lease,
    trustProxy: config.trustProxy,
    auth,
    leases,
    presence,
    previews,
    health,
    play,
    client,
  });
  // Hosted: the instance's folder is checked against the head every 30 s and repaired without a restart (plan §4),
  // holding the instance's lock alone: no request reads a folder being repaired.
  if (hosted)
    setInterval(() => {
      void server
        .exclusive(() => journal.reconcile())
        .then(
          (r) => {
            if (!(r.written + r.removed)) return;
            console.log(JSON.stringify({ event: 'reconciled', ...r }));
          },
          (e) => console.log(JSON.stringify({ event: 'reconcile-failed', message: String((e as Error).message) })),
        );
    }, 30_000).unref();
  server.on('error', (e) => {
    console.error(JSON.stringify({ event: 'listen-failed', message: (e as Error).message }));
    void lease.release().then(() => process.exit(1));
  });
  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({ event: 'listening', host: config.host, port: config.port, instance: lease.instance }));
    // The head's preview, unless it was built before this start.
    void previews?.schedule();
    void health?.schedule();
  });
  const stop = async (signal: string) => {
    console.log(JSON.stringify({ event: 'stopping', signal }));
    // New requests refused, the ones running finish (5 s at most), then the lease is given back.
    server.close();
    const drained = new Promise((ok) => server.once('close', ok));
    await Promise.race([drained, new Promise((ok) => setTimeout(ok, 5_000))]);
    server.closeAllConnections?.();
    previews?.close();
    health?.close();
    await journal.close().catch(() => undefined);
    await lease.release();
    setTimeout(() => process.exit(0), 100).unref();
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
  return -1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (e) => {
    console.error(e instanceof ConfigError ? `configuration: ${e.message}` : ((e as Error).stack ?? String(e)));
    process.exit(1);
  },
);
