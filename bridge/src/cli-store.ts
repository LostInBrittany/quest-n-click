// The Bridge's commands about its store (4.1.10, ADR 0009, D20; split from cli.ts): which store a configuration
// names, `migrate` (the JSON-lines journal into SQLite or Postgres, or the SQL schema up and down), `doctor`,
// `compact`, `tenant export|delete`, `backup` and `restore`. A store is named by a string: `jsonl` (the journal of
// 4.1.9, beside config.json), `sqlite:<file>` (relative to the Bridge's directory) or `postgres://…`; `--store=` or
// the `BRIDGE_STORE` variable override the configuration's (a database URL with a password stays out of the file;
// `BRIDGE_STORE_FILE`, 4.1.18, reads it from a secret file).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auditRestore,
  BackupError,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ROWS,
  makeBackup,
  readBackup,
  readBounded,
  RestoreUnknown,
  restoreBackup,
  stableJson,
  writeAtomic,
  writeNew,
} from './backup';
import { keepLease, type LeaseKind, MaintenanceError } from './maintenance';
import { inspectJournal, JsonlBridgeStore } from './store';
import { DEFAULT_TENANT, type RealityStore } from './store-async';
import { fromBridgeStore } from './store-memory';
import { PostgresRealityStore } from './store-postgres';
import { SqlRealityStore } from './store-sql';
import { SqliteRealityStore } from './store-sqlite';

/** `--key=value` or `--key value`. */
export const opt = (args: string[], k: string): string | undefined => {
  const eq = args.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.slice(k.length + 3);
  const i = args.indexOf(`--${k}`);
  const next = i >= 0 ? args[i + 1] : undefined;
  return next !== undefined && !next.startsWith('--') ? next : undefined;
};

/** The part of config.json these commands read. */
export interface StoreFile {
  journal: string;
  store?: string;
  tenantId?: string;
}

/**
 * The URL in `BRIDGE_STORE_FILE`: a file named and missing or empty stops the Bridge with why (second reading of
 * 4.1.18 PR 4: an empty secret fell back to each instance's own journal, a split store without a word).
 */
function storeFromFile(file: string): string {
  if (!existsSync(file)) throw new Error(`BRIDGE_STORE_FILE: ${file} does not exist`);
  const url = readFileSync(file, 'utf8').trim();
  if (!url) throw new Error(`BRIDGE_STORE_FILE: ${file} is empty`);
  return url;
}

/**
 * The store a configuration names, after `--store=`, `BRIDGE_STORE` and `BRIDGE_STORE_FILE` (4.1.18: the URL read from
 * a file, so a database password is mounted as a secret file, never in an environment a process listing shows).
 */
export const storeSpec = (file: StoreFile, args: string[], env = process.env): string =>
  opt(args, 'store') ??
  (env.BRIDGE_STORE || undefined) ??
  (env.BRIDGE_STORE_FILE ? storeFromFile(env.BRIDGE_STORE_FILE) : undefined) ??
  file.store ??
  'jsonl';

/** `sqlite` alone means the file `bridge.sqlite` beside config.json. */
const normal = (spec: string) => (spec === 'sqlite' ? 'sqlite:bridge.sqlite' : spec);

/** How long a maintenance lease lives without a renewal (renewed every third of it). */
export const LEASE_MS = { serve: 30_000, command: 60_000, exclusive: 10 * 60_000 } as const;

/**
 * Opens a store. The journal takes its lock (one process per journal, 4.1.8) unless `lock: false` (a read-only
 * command); SQL stores bring their schema up unless `migrate: false`. A SQL store from schema 5 on (4.1.20 PR 1c) is
 * held under a maintenance lease (bridge/src/maintenance.ts): `serving` by default whenever the store may be written,
 * `exclusive` for a restore, none for a command that only reads (`migrate: false`) or that leases itself; the lease
 * goes with `close`. Below schema 5 there is no lease table: the migrations up to it run under the dialect's own lock.
 */
export async function openStore(
  spec: string,
  dir: string,
  file: StoreFile,
  o: {
    lock?: boolean;
    migrate?: boolean;
    lease?: LeaseKind | false;
    leaseMs?: number;
    /** Postgres: how long the maintenance advisory lock is tried before the lease is refused (30 s by default). */
    lockTimeoutMs?: number;
    onLeaseEvent?: (e: Record<string, unknown>) => void;
    onRepair?: (what: string) => void;
    onPollError?: (e: unknown) => void;
  } = {},
): Promise<RealityStore> {
  const kind = o.lease ?? (o.migrate === false ? false : 'serving');
  const migrateUp = o.migrate ?? true;
  // A SQL store under a lease migrates under it (second reading of 4.1.20 PR 1c): opened as it is, the lease taken from
  // schema 5 on, then brought up; below 5 there is no lease table, so it is brought up first (the dialect's lock).
  const store = await openStoreOnly(spec, dir, file, kind ? { ...o, migrate: false } : o);
  if (!kind || !(store instanceof SqlRealityStore)) {
    if (kind && migrateUp && store instanceof SqlRealityStore) await store.migrate();
    return store;
  }
  let kept: Awaited<ReturnType<typeof keepLease>> | undefined;
  try {
    if ((await store.schemaVersion()) < 5 && migrateUp) await store.migrate();
    if ((await store.schemaVersion()) < 5) return store;
    kept = await keepLease(store, kind, {
      ttlMs: o.leaseMs ?? (kind === 'exclusive' ? LEASE_MS.exclusive : LEASE_MS.command),
      ...(o.lockTimeoutMs !== undefined ? { lockTimeoutMs: o.lockTimeoutMs } : {}),
      ...(o.onLeaseEvent ? { onEvent: o.onLeaseEvent } : {}),
    });
    if (migrateUp) await store.migrate();
  } catch (e) {
    await kept?.stop();
    await store.close();
    throw e;
  }
  if (!kept) return store;
  const stopLease = kept.stop;
  const close = store.close.bind(store);
  store.close = async () => {
    await stopLease();
    await close();
  };
  return store;
}

async function openStoreOnly(
  spec: string,
  dir: string,
  file: StoreFile,
  o: { lock?: boolean; migrate?: boolean; onRepair?: (what: string) => void; onPollError?: (e: unknown) => void } = {},
): Promise<RealityStore> {
  const s = normal(spec);
  if (s === 'jsonl') {
    const journal = new JsonlBridgeStore(resolve(dir, file.journal), {
      lock: o.lock ?? true,
      ...(o.onRepair ? { onRepair: o.onRepair } : {}),
    });
    const store = fromBridgeStore(journal, 'jsonl');
    const close = store.close.bind(store);
    store.close = async () => {
      await close();
      journal.close();
    };
    return store;
  }
  if (s.startsWith('sqlite:'))
    return SqliteRealityStore.open(resolve(dir, s.slice('sqlite:'.length)), {
      migrate: o.migrate ?? true,
      ...(o.onPollError ? { onPollError: o.onPollError } : {}),
    });
  if (/^postgres(ql)?:\/\//.test(s)) return PostgresRealityStore.open(s, { migrate: o.migrate ?? true });
  throw new Error(`unknown store "${spec}": jsonl, sqlite[:file] or postgres://…`);
}

const say = (s: string) => console.log(s);

/** A bound given on the command line: a positive integer, its default when absent; undefined (said) otherwise. */
function bound(args: string[], k: string, fallback: number): number | undefined {
  const v = opt(args, k);
  if (v === undefined) return fallback;
  if (/^[1-9]\d{0,15}$/.test(v)) return Number(v);
  console.error(`✖  --${k}=${v}: a positive integer`);
  return undefined;
}

/** The commands of this file; undefined when `cmd` is not one of them. */
export async function storeCommand(
  cmd: string,
  args: string[],
  dir: string,
  file: StoreFile & { tenantId?: string },
  writeFile: (f: StoreFile) => void,
): Promise<number | undefined> {
  const spec = storeSpec(file, args);
  if (cmd === 'migrate') {
    const from = opt(args, 'from');
    const to = opt(args, 'to');
    if (from === undefined) {
      // The SQL schema: up to the latest, or to a version (`--schema=0` undoes everything).
      const target = await openStore(spec, dir, file, { migrate: false });
      let kept: Awaited<ReturnType<typeof keepLease>> | undefined;
      try {
        if (!(target instanceof SqlRealityStore)) {
          console.error('✖  the JSON-lines journal has no schema: migrate --from=jsonl --to=sqlite moves it');
          return 1;
        }
        const version = opt(args, 'schema');
        // A migration down takes the store alone; up, it serves beside the others (4.1.20 PR 1c). Below schema 5 there
        // is no lease table: the dialect's lock of each step is all (and a descent below 5 asks every writer stopped).
        const at = await target.schemaVersion();
        if (at >= 5) {
          const down = version !== undefined && Number(version) < at;
          try {
            const lockTimeout = bound(args, 'lock-timeout', 30_000);
            if (lockTimeout === undefined) return 2;
            kept = await keepLease(target, down ? 'exclusive' : 'serving', {
              ttlMs: down ? LEASE_MS.exclusive : LEASE_MS.command,
              lockTimeoutMs: lockTimeout,
            });
          } catch (e) {
            if (!(e instanceof MaintenanceError)) throw e;
            console.error(`✖  ${e.message}; nothing migrated`);
            return 1;
          }
        }
        const done = await target.migrate(version === undefined ? {} : { to: Number(version) });
        say(`✔  schema ${await target.schemaVersion()}${done.length ? ` (${done.join(', ')})` : ' (nothing to do)'}`);
        return 0;
      } finally {
        await kept?.stop();
        await target.close();
      }
    }
    if (from !== 'jsonl' || !to) {
      console.error(
        'usage: migrate --from=jsonl --to=sqlite[:file]|postgres://… [--tenant=<id>]  ·  migrate [--schema=N]',
      );
      return 2;
    }
    // The journal is read under its lock (the Bridge must be stopped), written into the new store as one tenant.
    const tenantId = opt(args, 'tenant') ?? file.tenantId ?? DEFAULT_TENANT;
    const source = await openStore('jsonl', dir, file, { onRepair: (w) => say(`⚠  ${w}`) });
    const target = await openStore(to, dir, file);
    try {
      if ((await target.tenants()).includes(tenantId)) {
        console.error(`✖  the target already holds the tenant ${tenantId}: nothing written`);
        return 1;
      }
      const x = await source.exportTenant(DEFAULT_TENANT);
      await target.importTenant({
        ...x,
        tenantId,
        signals: x.signals.map((s) => ({ ...s, tenantId })),
        keys: x.keys.map((k) => ({ ...k, tenantId })),
        quarantine: x.quarantine.map((q) => ({ ...q, tenantId })),
      });
      const back = await target.exportTenant(tenantId);
      if (back.signals.length !== x.signals.length || back.players.length !== x.players.length) {
        console.error('✖  the target does not hold what was written: the configuration is left on the journal');
        return 1;
      }
      // The configuration now names the new store, unless it is a URL (a password stays out of the file).
      if (!args.includes('--no-config') && !/^postgres/.test(to)) writeFile({ ...file, store: normal(to) });
      say(
        `✔  ${x.players.length} players and ${x.signals.length} signals moved to ${normal(to).replace(/\/\/[^@]*@/, '//…@')} as tenant ${tenantId}; the journal is kept as it was`,
      );
      return 0;
    } finally {
      await source.close();
      await target.close();
    }
  }
  if (cmd === 'doctor' && normal(spec) === 'jsonl') {
    // The journal read without a change: its lines, its players and signals, a last line cut short, corruption.
    const r = inspectJournal(resolve(dir, file.journal));
    console.log(JSON.stringify({ event: 'journal', ...r }));
    if (r.corrupt) {
      console.error(`✖  ${r.corrupt}: the Bridge will not start on it`);
      return 1;
    }
    say(r.torn ? '⚠  the last line was cut short by a crash: `serve` drops it and says so' : '✔  journal readable');
    return 0;
  }
  if (cmd === 'doctor') {
    // A SQL store read without a change: its schema, each tenant's rows, any gap in a player's sequence, quarantine.
    const store = await openStore(spec, dir, file, { migrate: false });
    try {
      const sql = store as SqlRealityStore;
      const version = await sql.schemaVersion();
      let bad = false;
      const report: Record<string, unknown>[] = [];
      for (const t of await store.tenants()) {
        const x = await store.exportTenant(t);
        const byPlayer = new Map<string, number[]>();
        for (const s of x.signals) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s.sequence]);
        const gaps = [...byPlayer].filter(([, seqs]) => seqs.some((n, i) => n !== i + 1)).map(([p]) => p);
        if (gaps.length) bad = true;
        report.push({
          tenant: t,
          players: x.players.length,
          signals: x.signals.length,
          gaps,
          quarantined: x.quarantine.length,
        });
      }
      console.log(JSON.stringify({ event: 'store', kind: store.kind, schema: version, tenants: report }));
      for (const q of await store.quarantined())
        say(`⚠  quarantined: tenant ${q.tenantId}, ${q.playerId} #${q.sequence}: ${q.reason}`);
      say(bad ? '✖  a player has a gap in its sequence' : `✔  ${store.kind} store readable (schema ${version})`);
      return bad ? 1 : 0;
    } finally {
      await store.close();
    }
  }
  if (cmd === 'compact' && normal(spec) !== 'jsonl') {
    console.error(
      '✖  compact rewrites the JSON-lines journal; a SQL store keeps every signal in 4.1.10 (no retention yet)',
    );
    return 1;
  }
  if (cmd === 'tenant') {
    const [, sub] = args;
    const tenantId = opt(args, 'tenant') ?? file.tenantId ?? DEFAULT_TENANT;
    const store = await openStore(spec, dir, file);
    try {
      if (sub === 'export') {
        const out = JSON.stringify(await store.exportTenant(tenantId), null, 1);
        const to = opt(args, 'out');
        if (to) {
          writeFileSync(resolve(to), `${out}\n`, { mode: 0o600 });
          say(`✔  tenant ${tenantId} exported to ${resolve(to)}`);
        } else process.stdout.write(`${out}\n`);
        return 0;
      }
      if (sub === 'delete') {
        if (!args.includes('--yes')) {
          console.error(`✖  deleting the tenant ${tenantId} removes every row it has: add --yes`);
          return 1;
        }
        await store.deleteTenant(tenantId);
        say(`✔  tenant ${tenantId} deleted`);
        return 0;
      }
      console.error('usage: tenant <export|delete> --tenant=<id> [--out=<file>] [--yes]');
      return 2;
    } finally {
      await store.close();
    }
  }
  if (cmd === 'backup') {
    const out = opt(args, 'out');
    if (!out) {
      console.error('usage: backup --out=<file> [--max-bytes=<n>] [--max-rows=<n>]');
      return 2;
    }
    const maxBytes = bound(args, 'max-bytes', MAX_BACKUP_BYTES);
    const maxRows = bound(args, 'max-rows', MAX_BACKUP_ROWS);
    if (maxBytes === undefined || maxRows === undefined) return 2;
    const store = await openStore(spec, dir, file, { lock: false });
    try {
      // Schema 4 (4.1.20, ADR 0023): one snapshot of every family, its completeness, counts and envelope digest.
      const b = await makeBackup(store, { maxRows });
      const content = `${JSON.stringify(b)}\n`;
      const bytes = Buffer.byteLength(content);
      if (bytes > maxBytes) {
        console.error(
          `✖  the backup would be ${bytes} bytes, more than ${maxBytes} (--max-bytes=): no file written; use pg_dump or the provider's snapshots`,
        );
        return 1;
      }
      writeAtomic(resolve(out), content);
      const c = b.counts;
      say(
        `✔  ${c.tenants} tenant(s), ${c.signals} signal(s), ${c.runs} run(s), ${c.daily} daily record(s) backed up to ${resolve(out)} (schema 4, one snapshot, sha256 ${b.digest.value.slice(0, 12)}…)`,
      );
      return 0;
    } catch (e) {
      if (e instanceof BackupError) {
        console.error(`✖  ${e.message}: no file written`);
        return 1;
      }
      throw e;
    } finally {
      await store.close();
    }
  }
  if (cmd === 'restore') {
    // 4.1.20 PR 1b (ADR 0023): the mode is always said. `merge` is 4.1.19's restore; `replace-store` makes the store
    // the file, after a safety backup of the store, written and read back first.
    const mode = opt(args, 'mode');
    const usage =
      "usage: restore --from=<backup file> --mode=merge [--force] [--max-bytes=<n>] [--lock-timeout=<ms>]   (a backup's digest is an integrity check, not a signature)\n" +
      '       restore --from=<backup file> --mode=replace-store --yes-replace-store --safety-out=<new file> [--max-bytes=<n>] [--max-rows=<n>] [--lock-timeout=<ms>]';
    const from = opt(args, 'from');
    if (!from || (mode !== 'merge' && mode !== 'replace-store')) {
      console.error(
        `${usage}\n${from ? '✖  say the mode: --mode=merge keeps what the file does not speak of, --mode=replace-store makes the store the file; nothing restored' : ''}`.trimEnd(),
      );
      return 2;
    }
    const replace = mode === 'replace-store';
    const safetyArg = opt(args, 'safety-out');
    if (replace && args.includes('--force')) {
      console.error(`${usage}\n✖  --force is merge's: replace-store replaces everything already; nothing restored`);
      return 2;
    }
    if (replace && !args.includes('--yes-replace-store')) {
      console.error(
        `${usage}\n✖  replace-store deletes what the file does not hold: say it with --yes-replace-store; nothing restored`,
      );
      return 2;
    }
    if (!replace && (safetyArg || args.includes('--yes-replace-store'))) {
      console.error(
        `${usage}\n✖  --safety-out and --yes-replace-store are replace-store's: merge deletes nothing the file does not speak of; nothing restored`,
      );
      return 2;
    }
    if (replace && !safetyArg) {
      console.error(
        `${usage}\n✖  replace-store first backs up the store it replaces: --safety-out=<a new file>; nothing restored`,
      );
      return 2;
    }
    // Everything is read and checked before the store is opened: a file refused touches nothing.
    const maxBytes = bound(args, 'max-bytes', MAX_BACKUP_BYTES);
    // The safety backup's row bound (replace-store), as `backup --max-rows`.
    const maxRows = bound(args, 'max-rows', MAX_BACKUP_ROWS);
    if (maxBytes === undefined || maxRows === undefined) return 2;
    let read: ReturnType<typeof readBackup>;
    try {
      read = readBackup(readBounded(resolve(from), maxBytes));
    } catch (e) {
      if (e instanceof BackupError) {
        console.error(`✖  ${e.message}: nothing restored`);
        return 1;
      }
      throw e;
    }
    if (replace && (read.schema !== 4 || read.completeness?.scope !== 'whole-store')) {
      console.error(
        `✖  replace-store needs a schema 4 backup of a whole SQL store (this one is schema ${read.schema}${read.completeness ? `, ${read.completeness.scope}` : ''}: nothing under its digest says it holds every family); restore it with --mode=merge, or take a new backup; nothing restored`,
      );
      return 1;
    }
    if (normal(spec) === 'jsonl') {
      console.error(
        '✖  the JSON-lines journal cannot be restored all or nothing: migrate it to SQLite first (migrate --from=jsonl --to=sqlite), then restore with --store=sqlite; nothing restored',
      );
      return 1;
    }
    // Maintenance (4.1.20 PR 1c): the store alone, or nothing; refused at once while anything serves or writes it.
    const lockTimeout = bound(args, 'lock-timeout', 30_000);
    if (lockTimeout === undefined) return 2;
    let store: RealityStore;
    try {
      store = await openStore(spec, dir, file, { lease: 'exclusive', lockTimeoutMs: lockTimeout });
    } catch (e) {
      if (e instanceof MaintenanceError) {
        console.error(`✖  ${e.message}; nothing restored`);
        return 1;
      }
      throw e;
    }
    const safety = safetyArg ? resolve(safetyArg) : undefined;
    // The way back is said in every outcome once it exists: success, failure, an unknown commit.
    const back = () => (safety && existsSync(safety) ? ` (the store before: ${safety})` : '');
    try {
      if (!(store instanceof SqlRealityStore)) {
        console.error('✖  restore needs a SQL store (--store=sqlite or postgres://…): nothing restored');
        return 1;
      }
      // What the file speaks for: schema 4 says it (`completeness`); before it, runs from schema 2, quotas never. A
      // journal's or memory's file (`tenants-only`) speaks for no run and no quota: merge leaves them as they are.
      const carriesRuns = read.completeness ? read.completeness.families.includes('runs') : read.schema >= 2;
      const carriesQuotas = read.completeness?.families.includes('run-quotas') ?? false;
      const at = await store.schemaVersion();
      if (read.storeSchema !== null && read.storeSchema > at) {
        console.error(
          `✖  the backup comes from a store at schema ${read.storeSchema}, newer than this one (${at}): upgrade the Bridge; nothing restored`,
        );
        return 1;
      }
      if (replace && read.storeSchema !== at) {
        console.error(
          `✖  replace-store needs a backup of this store's SQL schema (${at}); the file is of schema ${read.storeSchema}: a family it does not know would be lost; nothing restored`,
        );
        return 1;
      }
      if (replace && safety) {
        // The safety backup, before any deletion: written to a new file only, read back and checked, or nothing goes.
        try {
          const b = await makeBackup(store, { maxRows });
          const content = `${JSON.stringify(b)}\n`;
          if (Buffer.byteLength(content) > maxBytes)
            throw new BackupError(
              `the store's safety backup would be ${Buffer.byteLength(content)} bytes, more than ${maxBytes} (--max-bytes=)`,
            );
          writeNew(safety, content);
          // Read back whole: its digest checked by readBackup, its payload the very snapshot taken.
          if (stableJson(readBackup(readBounded(safety, maxBytes)).payload) !== stableJson(b.payload))
            throw new BackupError(`${safety} does not read back as written`);
        } catch (e) {
          console.error(
            `✖  the safety backup could not be written and checked (${(e as Error).message}): nothing deleted, nothing restored`,
          );
          return 1;
        }
      }
      let outcome: Awaited<ReturnType<typeof restoreBackup>>;
      try {
        outcome = await restoreBackup(store, read.payload, {
          force: args.includes('--force'),
          carriesRuns,
          carriesQuotas,
          mode,
          // The exclusive lease lost meanwhile (Postgres: its lock's connection dropped): rolled back before the commit.
          stillHeld: () => (store as SqlRealityStore).heldBecause,
        });
      } catch (e) {
        if (e instanceof RestoreUnknown) {
          console.error(
            `✖  the commit's answer was lost (${e.message}): the restore may or may not be in the store; run \`doctor\` and take a backup to see which${back()}`,
          );
          return 3;
        }
        console.error(`✖  the restore failed and was rolled back, nothing restored: ${(e as Error).message}${back()}`);
        return 1;
      }
      if (!outcome.ok) {
        console.error(`✖  ${outcome.why}; nothing restored${back()}`);
        return 1;
      }
      // An audit after the commit: a difference here is the backend's fault, a P0, said as such.
      let wrong: string | undefined;
      try {
        wrong = await auditRestore(store, read.payload, { carriesRuns, carriesQuotas, mode });
      } catch (e) {
        wrong = `the audit could not read it back (${(e as Error).message})`;
      }
      if (wrong) {
        console.error(
          `✖  P0: the restore committed but ${wrong}. If a Bridge was serving this store meanwhile, its writes may explain it; otherwise keep this store for inspection${back()}`,
        );
        return 3;
      }
      say(
        `✔  ${outcome.tenants} tenant(s), ${outcome.runs} run(s), ${outcome.daily} daily record(s)${outcome.quotas !== undefined ? `, ${outcome.quotas} quota row(s)` : ''} restored from ${read.at} (schema ${read.schema}, ${mode}), checked before and after the commit${back()}`,
      );
      return 0;
    } finally {
      await store.close();
    }
  }
  return undefined;
}
