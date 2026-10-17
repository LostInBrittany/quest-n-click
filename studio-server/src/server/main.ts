// studio-server <command> --config <file> (4.2.1, plan §4 and §7 row 4):
//   serve          the Studio Server: the API, the probes, the service lease
//   import <dir>   a game folder becomes the instance's project (the journal adopts it; hosted: its files go to the blobs)
//   export <dir>   the game at the head, written to a folder, with a manifest of the hashes and the revision
// Secrets come from `<NAME>_FILE` or the environment (config.ts) and leave `process.env` before anything else runs.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openSqliteDb } from '../../../bridge/src/store-sqlite';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { createStudio } from '../ops/core';
import { type BlobStore, fsBlobStore } from '../ops/blobs';
import { sha256 } from '../ops/durable';
import { Journal } from '../ops/journal';
import { ConfigError, loadConfig, type StudioServerConfig, takeSecrets } from './config';
import { studioServer } from './http';
import { openPostgresDb } from './postgres';
import { S3, s3BlobStore } from './s3';
import { ServiceLease } from './service-lease';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

async function openAll(config: StudioServerConfig) {
  const secrets = takeSecrets();
  let db: SqlDb;
  if (config.store.kind === 'postgres') {
    if (!secrets.STUDIO_DATABASE_URL) throw new ConfigError('STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required');
    db = await openPostgresDb(secrets.STUDIO_DATABASE_URL);
  } else db = await openSqliteDb(resolve(config.store.file!));
  let blobs: BlobStore;
  if (config.blobs.kind === 's3') {
    if (!secrets.STUDIO_S3_KEY_ID || !secrets.STUDIO_S3_KEY_SECRET)
      throw new ConfigError('STUDIO_S3_KEY_ID and STUDIO_S3_KEY_SECRET (or the Cellar add-on variables) are required');
    const endpoint = /^https?:\/\//.test(config.blobs.host!) ? config.blobs.host! : `https://${config.blobs.host}`;
    blobs = s3BlobStore(
      new S3({ endpoint, bucket: config.blobs.bucket!, keyId: secrets.STUDIO_S3_KEY_ID, secret: secrets.STUDIO_S3_KEY_SECRET }),
    );
  } else blobs = fsBlobStore(resolve(config.blobs.dir!));
  const gameDir = resolve(config.workDir, 'game');
  mkdirSync(gameDir, { recursive: true });
  return { db, blobs, gameDir };
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const at = rest.indexOf('--config');
  const file = at >= 0 ? rest[at + 1] : process.env.STUDIO_CONFIG;
  if (!cmd || !file) {
    console.error('usage: studio-server <serve|import <dir>|export <dir>> --config <file>');
    return 2;
  }
  const args = rest.filter((_, i) => i !== at && i !== at + 1);
  const config = loadConfig(file);
  const { db, blobs, gameDir } = await openAll(config);
  const hosted = config.store.kind === 'postgres';

  if (cmd === 'import') {
    const from = args[0] && resolve(args[0]);
    if (!from || !existsSync(join(from, 'index.ts'))) {
      console.error('import: a game folder (with its index.ts) is required');
      return 2;
    }
    if (readdirSync(gameDir).length) {
      console.error(`import: ${gameDir} is not empty: this instance already has a project`);
      return 1;
    }
    cpSync(from, gameDir, { recursive: true });
    // Opening adopts the folder as one operation (and, hosted, stores every file in the blobs).
    const j = await Journal.open({ db, blobs, gameDir, hosted });
    console.log(JSON.stringify({ event: 'imported', game: config.game, revision: await j.revision() }));
    await j.close();
    return 0;
  }

  const journal = await Journal.open({ db, blobs, gameDir, hosted });

  if (cmd === 'export') {
    const out = args[0] && resolve(args[0]);
    if (!out || (existsSync(out) && readdirSync(out).length)) {
      console.error('export: an empty or new folder is required');
      return 2;
    }
    const files = (await db.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map((r) => ({
      path: String(r.path),
      blob: String(r.blob),
    }));
    for (const f of files) {
      const bytes = await blobs.has(f.blob) ? await blobs.get(f.blob) : undefined;
      const target = join(out, ...f.path.split('/'));
      mkdirSync(join(target, '..'), { recursive: true });
      // A local journal keeps blobs only for what it wrote: the rest is read from the game folder, checked.
      const data = bytes ?? readFileSync(join(gameDir, ...f.path.split('/')));
      if (sha256(data) !== f.blob) throw new Error(`${f.path}: the content does not match the head`);
      writeFileSync(target, data);
    }
    const manifest = { game: config.game, epoch: await journal.epoch(), revision: await journal.revision(), files };
    writeFileSync(join(out, 'export-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(JSON.stringify({ event: 'exported', revision: manifest.revision, files: files.length }));
    await journal.close();
    return 0;
  }

  if (cmd !== 'serve') {
    console.error(`unknown command: ${cmd}`);
    return 2;
  }
  // No authentication before PR 5: the loopback only.
  if (!LOOPBACK.has(config.host)) {
    console.error(`serve: ${config.host} is refused until authentication is configured (4.2.1 PR 5); use 127.0.0.1`);
    return 2;
  }
  const lease = new ServiceLease(db);
  lease.start((held) => console.log(JSON.stringify({ event: held ? 'lease-taken' : 'lease-lost', instance: lease.instance })));
  const studio = createStudio({ gameDir, root: resolve(config.workDir), journal, author: 'studio-server' });
  const server = studioServer({ studio, journal, db, lease, trustProxy: config.trustProxy });
  // Hosted: the instance's folder is checked against the head every 30 s and repaired without a restart (plan §4).
  if (hosted)
    setInterval(() => {
      void journal.reconcile().then(
        (r) => r.written + r.removed && console.log(JSON.stringify({ event: 'reconciled', ...r })),
        (e) => console.log(JSON.stringify({ event: 'reconcile-failed', message: String((e as Error).message) })),
      );
    }, 30_000).unref();
  server.listen(config.port, config.host, () =>
    console.log(JSON.stringify({ event: 'listening', host: config.host, port: config.port, instance: lease.instance })),
  );
  const stop = async (signal: string) => {
    console.log(JSON.stringify({ event: 'stopping', signal }));
    server.close();
    server.closeAllConnections?.();
    await lease.release();
    await journal.close().catch(() => undefined);
    setTimeout(() => process.exit(0), 200).unref();
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
    console.error(e instanceof ConfigError ? `configuration: ${e.message}` : (e as Error).stack ?? String(e));
    process.exit(1);
  },
);
