// npx tsx tools/backup-memory.ts [--store=sqlite|postgres://…] [--sizes=64,128,256] [--bridge=<installed bridge dir>]
// [--container-mb=512] [--out=<file>] (4.1.20 PR 3, docs/dev/PLAN-4.1.20-LAST-MILE.md §6.5): what a large backup costs
// in memory. For each size (MiB), a store filled with runs until its backup is that large, then the Bridge's own
// commands, each in a process of its own whose peak resident memory is read at its exit (`maxRSS`): the export
// (`backup`), the read (the file read, parsed, its digest checked: `readBackup`, which canonicalises it), the restore
// (`restore --mode=merge` into an empty store); their durations; then a file one byte above a restore's `--max-bytes=`,
// refused before it is parsed, and a store one row above a backup's `--max-rows=`, refused before it is loaded. Each peak is set against the qualification container's
// memory limit (ops/qualify/compose.yml, 512 MiB), so the envelope a deployment needs is a measure, not a guess.
// Measured on a runner (the candidate's `backup-memory` job), never on a laptop.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SqlRealityStore } from '../bridge/src/store-sql';

const ROOT = resolve(import.meta.dirname, '..');
const ENVELOPE = 4096;
/** A run's row in a backup: its envelope and its other columns, as JSON (measured: the fill aims at this). */
const ROW_BYTES = ENVELOPE + 420;

export interface Phase {
  rssMb: number;
  seconds: number;
  code: number;
  said?: string;
}

/** A command of the Bridge in a process of its own, its peak resident memory read at its exit. */
function measured(cmd: string[], env: NodeJS.ProcessEnv = {}): Phase {
  const dir = mkdtempSync(join(tmpdir(), 'rss-'));
  const preload = join(dir, 'rss.cjs');
  const out = join(dir, 'rss');
  // `maxRSS` is in kilobytes on every platform Node runs on.
  writeFileSync(
    preload,
    `process.on('exit', () => require('node:fs').writeFileSync(${JSON.stringify(out)}, String(process.resourceUsage().maxRSS)));\n`,
  );
  const t = performance.now();
  const r = spawnSync(process.execPath, ['--require', preload, ...cmd], {
    // From the checkout's root: `--import tsx` resolves there.
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: { ...process.env, ...env },
  });
  const seconds = Math.round((performance.now() - t) / 100) / 10;
  let kb = 0;
  try {
    kb = Number(readFileSync(out, 'utf8'));
  } catch {
    /* the process died before its exit handler */
  }
  rmSync(dir, { recursive: true, force: true });
  // What the command said: its error when it died of one (never Node's trailing "Node.js v22…" line), else its last
  // line, Node's own warnings (SQLite's experimental one) left out.
  const lines = `${r.stdout}\n${r.stderr}`
    .split('\n')
    .filter((l) => l.trim() && !/ExperimentalWarning|--trace-warnings|^Node\.js v\d/.test(l));
  const said = (lines.find((l) => /^\s*(\w*Error|✖)/.test(l)) ?? lines.at(-1))?.slice(0, 200);
  return { rssMb: Math.round(kb / 1024), seconds, code: r.status ?? -1, ...(said ? { said } : {}) };
}

/** The store a size is measured on: a new SQLite file, or a new database on the Postgres server named. */
async function freshStore(spec: string, dir: string, name: string): Promise<{ url: string; store: SqlRealityStore }> {
  if (spec === 'sqlite') {
    const { SqliteRealityStore } = await import('../bridge/src/store-sqlite');
    const file = join(dir, `${name}.sqlite`);
    return { url: `sqlite:${file}`, store: await SqliteRealityStore.open(file) };
  }
  const { PostgresRealityStore } = await import('../bridge/src/store-postgres');
  // As the tests load it: the module named at run time (BRIDGE_PG_MODULE, else pg), its types the adapter's own.
  const pg = ((await import(/* @vite-ignore */ process.env.BRIDGE_PG_MODULE ?? 'pg')) as { default: never }).default;
  const admin = await PostgresRealityStore.open(spec, { pg, migrate: false });
  const db = `bm_${name}_${randomBytes(3).toString('hex')}`;
  await admin.db.run(`CREATE DATABASE ${db}`);
  await admin.close();
  const url = spec.replace(/\/[^/?]*(\?|$)/, `/${db}$1`);
  return { url, store: await PostgresRealityStore.open(url, { pg }) };
}

/** Runs of tenant `t` written in batches until about `bytes` of backup. */
async function fill(store: SqlRealityStore, t: string, bytes: number): Promise<number> {
  const rows = Math.ceil(bytes / ROW_BYTES);
  const envelope = 'x'.repeat(ENVELOPE);
  for (let from = 0; from < rows; from += 1000)
    await store.db.tx(undefined, async (q) => {
      for (let i = from; i < Math.min(from + 1000, rows); i++)
        await q.run(
          'INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
          [
            t,
            `run_${i}`,
            'reference',
            'any%',
            `p${i % 5000}`,
            1_700_000_000_000 + i,
            'done',
            'valid',
            'replay-valid',
            String(150_000_000 + i),
            'any%',
            `k-${i}`,
            '0'.repeat(64),
            envelope,
          ],
        );
    });
  return rows;
}

if (process.argv[2] === '--phase=read') {
  // The read alone, in this very process (`node --import tsx`, so the peak is the read's, not a wrapper's): the file
  // read under its bound, parsed, its envelope's digest checked, by the Bridge's own module (the candidate archive's
  // sources when --bridge names it; tsx would re-spawn a child the exit hook never sees).
  const { readBackup, readBounded } = (await import(
    pathToFileURL(process.argv[5]!).href
  )) as typeof import('../bridge/src/backup');
  const r = readBackup(readBounded(process.argv[3]!, Number(process.argv[4])));
  console.log(`read: schema ${r.schema}`);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const spec = flag('store') ?? 'sqlite';
  const sizes = (flag('sizes') ?? '64,128,256').split(',').map(Number);
  const containerMb = Number(flag('container-mb') ?? 512);
  const bin = flag('bridge') ? join(resolve(flag('bridge')!), 'bin.mjs') : join(ROOT, 'bridge', 'bin.mjs');
  // The read is the checkout's backup module, run through tsx: the archive ships one bundle (src/cli.mjs) that exports
  // no `readBackup`, and the candidate checks out the very commit it packs, so these are the sources of that bundle.
  const backupModule = join(ROOT, 'bridge', 'src', 'backup', 'index.ts');
  if (!existsSync(backupModule)) throw new Error(`backup-memory: no ${backupModule}`);
  const dir = mkdtempSync(join(tmpdir(), 'backup-memory-'));
  const manifest = join(dir, 'manifest.json');
  writeFileSync(
    manifest,
    JSON.stringify({
      format: 'web-scumm-reality-manifest',
      schema: 1,
      gameId: 'memory',
      signals: [{ id: 'a.b', source: 'email', availability: 'optional', replay: 'record', once: false }],
      connectors: {},
    }),
  );
  const result: Record<string, unknown> = {
    format: 'web-scumm-backup-memory',
    schema: 1,
    store: spec === 'sqlite' ? 'sqlite' : 'postgres',
    containerMb,
    // Export and restore run the Bridge named by --bridge (the candidate's archive); the read, its sources at this commit.
    bridge: flag('bridge') ? 'archive' : 'checkout',
    readModule: 'checkout:bridge/src/backup/index.ts',
    runner: { os: process.env.RUNNER_OS ?? process.platform, image: process.env.ImageOS ?? 'local' },
    // What the Bridge takes before any backup: `doctor` on an empty store, the same process shape.
    sizes: [] as unknown[],
  };
  let code = 0;
  try {
    for (const mb of sizes) {
      const tenantDir = join(dir, `t${mb}`);
      const src = await freshStore(spec, dir, `src${mb}`);
      const init = spawnSync(
        process.execPath,
        [
          bin,
          'init',
          `--dir=${tenantDir}`,
          '--tenant=a',
          `--store=${src.url}`,
          `--manifest=${manifest}`,
          '--no-demo-webhooks',
        ],
        { encoding: 'utf8' },
      );
      if (init.status !== 0) throw new Error(`init: ${init.stderr}`);
      const rows = await fill(src.store, 'a', mb * 2 ** 20);
      await src.store.close();
      const file = join(dir, `b${mb}.json`);
      const max = String(2 * mb * 2 ** 20);
      const exportPhase = measured([
        bin,
        'backup',
        `--dir=${tenantDir}`,
        `--store=${src.url}`,
        `--out=${file}`,
        `--max-bytes=${max}`,
      ]);
      const bytes = exportPhase.code === 0 ? statSync(file).size : 0;
      const read = measured(['--import', 'tsx', import.meta.filename, '--phase=read', file, max, backupModule]);
      const dst = await freshStore(spec, dir, `dst${mb}`);
      await dst.store.close();
      // One byte above the bound, one row above it: refused before anything is restored (the store still empty after).
      const byteOver = measured([
        bin,
        'restore',
        `--dir=${tenantDir}`,
        `--store=${dst.url}`,
        `--from=${file}`,
        '--mode=merge',
        `--max-bytes=${bytes - 1}`,
      ]);
      // The row bound is the export's (and the safety backup's): the store's exact count read from a refusal, then a
      // backup bounded one row below it refused, and one bounded at it written.
      const counted = measured([
        bin,
        'backup',
        `--dir=${tenantDir}`,
        `--store=${src.url}`,
        `--out=${file}.count`,
        '--max-rows=1',
      ]);
      const total = Number(/holds (\d+) rows/.exec(counted.said ?? '')?.[1] ?? Number.NaN);
      const rowOver = measured([
        bin,
        'backup',
        `--dir=${tenantDir}`,
        `--store=${src.url}`,
        `--out=${file}.over`,
        `--max-bytes=${max}`,
        `--max-rows=${total - 1}`,
      ]);
      const rowAt = measured([
        bin,
        'backup',
        `--dir=${tenantDir}`,
        `--store=${src.url}`,
        `--out=${file}.at`,
        `--max-bytes=${max}`,
        `--max-rows=${total}`,
      ]);
      rmSync(`${file}.at`, { force: true });
      const restore = measured([
        bin,
        'restore',
        `--dir=${tenantDir}`,
        `--store=${dst.url}`,
        `--from=${file}`,
        '--mode=merge',
        `--max-bytes=${max}`,
      ]);
      // The Bridge before any backup: `doctor` on this store, the same process shape.
      const base = measured([bin, 'doctor', `--dir=${tenantDir}`, `--store=${src.url}`]);
      const peak = Math.max(exportPhase.rssMb, read.rssMb, restore.rssMb);
      const entry = {
        targetMb: mb,
        bytes,
        rows,
        export: exportPhase,
        read,
        restore,
        byteOver: {
          refused: byteOver.code !== 0 && /bytes/.test(byteOver.said ?? ''),
          rssMb: byteOver.rssMb,
          said: byteOver.said,
        },
        rowOver: {
          rows: total,
          refused: rowOver.code !== 0 && /rows/.test(rowOver.said ?? ''),
          atBoundWritten: rowAt.code === 0,
          atBoundSaid: rowAt.said,
          said: rowOver.said,
        },
        baseRssMb: base.rssMb,
        peakRssMb: peak,
        // The share of the qualification container one of these commands takes at its peak.
        ofContainer: Math.round((peak / containerMb) * 100) / 100,
        // Resident memory per MiB of backup above the Bridge's own: what sizes the envelope.
        rssPerBackupMb:
          bytes && peak > base.rssMb ? Math.round(((peak - base.rssMb) / (bytes / 2 ** 20)) * 100) / 100 : null,
      };
      (result.sizes as unknown[]).push(entry);
      const ok =
        exportPhase.code === 0 &&
        read.code === 0 &&
        restore.code === 0 &&
        entry.byteOver.refused &&
        entry.rowOver.refused &&
        entry.rowOver.atBoundWritten;
      console.log(
        `${ok ? '✔' : '✖'}  ${result.store} ${mb} MiB (${bytes} bytes, ${rows} runs): export ${exportPhase.rssMb} MB/${exportPhase.seconds} s, read ${read.rssMb} MB/${read.seconds} s, restore ${restore.rssMb} MB/${restore.seconds} s; one byte over ${entry.byteOver.refused ? 'refused' : 'ACCEPTED'}, one row over ${entry.rowOver.refused ? 'refused' : 'ACCEPTED'}, at the bound ${entry.rowOver.atBoundWritten ? 'written' : 'REFUSED'}`,
      );
      for (const [k, p] of Object.entries({ export: exportPhase, read, restore }))
        if (p.code !== 0) console.error(`✖  ${k}: exit ${p.code}: ${p.said}`);
      // A refusal is the contract (exit 1 means a check failed); a peak above the container is a measure, said.
      if (!ok) code = 1;
      if (peak > containerMb)
        console.log(
          `::warning::${result.store} ${mb} MiB: a command peaks at ${peak} MB, above the qualification container's ${containerMb} MiB`,
        );
      rmSync(file, { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (flag('out')) writeFileSync(flag('out')!, `${JSON.stringify(result, null, 1)}\n`);
  process.exit(code);
}
