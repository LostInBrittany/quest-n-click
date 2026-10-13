// Maintenance (4.1.20 PR 1c, ADR 0023, plan §6.4): a restore has the store alone or nothing. Every writer holds a
// lease in the store itself (migration 0005): `serving` for `serve` and the writing commands, `exclusive` for a restore
// or a migration down. A live lease in the way is refused at once, with who holds it; an expired one is deleted; every
// time is the database's; a lease lost holds the store's writes until it is taken again. SQLite always (several
// processes share one file), Postgres when BRIDGE_PG_URL names a server (and its advisory lock beside the lease).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { realityManifest } from '@engine/reality/manifest';
import { makeBackup, restoreBackup, stableJson } from '../bridge/src/backup';
import { main } from '../bridge/src/cli';
import { LEASE_MS, openStore } from '../bridge/src/cli-store';
import { keepLease, MaintenanceError, takeLease } from '../bridge/src/maintenance';
import { type PgModule, PostgresRealityStore } from '../bridge/src/store-postgres';
import { type SqlRealityStore, WritesHeldError } from '../bridge/src/store-sql';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';
import { pgDatabase } from './fixtures/pg-database';
import { signals } from './fixtures/signals';

const temps: string[] = [];
const opened: SqlRealityStore[] = [];
afterAll(async () => {
  for (const s of opened) await s.close().catch(() => {});
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'bridge-maintenance-'));
  temps.push(d);
  return d;
};
const until = async (ok: () => boolean | Promise<boolean>, ms = 3000) => {
  for (let t = 0; t < ms && !(await ok()); t += 20) await new Promise((r) => setTimeout(r, 20));
};

/** Two handles on one store (two processes, two instances) and the URL a command opens it by. */
const KINDS: { name: string; open(): Promise<{ a: SqlRealityStore; b: SqlRealityStore; url: string }> }[] = [
  {
    name: 'sqlite',
    open: async () => {
      const file = join(tmp(), 'bridge.sqlite');
      const a = await SqliteRealityStore.open(file, { pollMs: 0 });
      const b = await SqliteRealityStore.open(file, { pollMs: 0 });
      opened.push(a, b);
      return { a, b, url: `sqlite:${file}` };
    },
  },
];
if (process.env.BRIDGE_PG_URL)
  KINDS.push({
    name: 'postgres',
    open: async () => {
      const pg = ((await import(/* @vite-ignore */ process.env.BRIDGE_PG_MODULE ?? 'pg')) as { default: PgModule })
        .default;
      const url = await pgDatabase('bridge_maintenance');
      const a = await PostgresRealityStore.open(url, { pg });
      const b = await PostgresRealityStore.open(url, { pg });
      opened.push(a, b);
      return { a, b, url };
    },
  });

/**
 * A holder that dies (its lease left behind). On SQLite the row stays and expires; on Postgres the advisory lock goes
 * with the connection, as when a process is killed: that connection is terminated from another.
 */
async function crash(kind: string, other: SqlRealityStore): Promise<void> {
  if (kind !== 'postgres') return;
  await other.leaseDb.all(
    "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND pid <> pg_backend_pid() AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
  );
}

async function cli(args: string[]): Promise<{ code: number; out: string }> {
  const out: string[] = [];
  const [log, err] = [console.log, console.error];
  console.log = (x: unknown) => void out.push(String(x));
  console.error = (x: unknown) => void out.push(String(x));
  try {
    return { code: await main(args, { manifest: realityManifest(signals()) }), out: out.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

describe.each(KINDS)('maintenance leases on $name', (kind) => {
  it('serving leases share the store; an exclusive one is refused at once, naming them; then the reverse', async () => {
    const { a, b } = await kind.open();
    const one = await takeLease(a, 'serving', { ttlMs: 60_000, instanceId: 'serve-1' });
    const two = await takeLease(b, 'serving', { ttlMs: 60_000, instanceId: 'serve-2' });
    const t0 = Date.now();
    await expect(takeLease(a, 'exclusive', { ttlMs: 60_000, lockTimeoutMs: 300 })).rejects.toThrow(MaintenanceError);
    await expect(takeLease(a, 'exclusive', { ttlMs: 60_000, lockTimeoutMs: 300 })).rejects.toThrow(/serve-1.*serve-2/);
    // Refused, never waited for (the advisory lock on Postgres is tried for 300 ms here, twice).
    expect(Date.now() - t0).toBeLessThan(5_000);
    await one.release();
    await two.release();
    const alone = await takeLease(a, 'exclusive', { ttlMs: 60_000, instanceId: 'restore-1' });
    await expect(takeLease(b, 'serving', { ttlMs: 60_000, lockTimeoutMs: 300 })).rejects.toThrow(
      /maintenance.*restore-1/,
    );
    await expect(takeLease(b, 'exclusive', { ttlMs: 60_000, lockTimeoutMs: 300 })).rejects.toThrow(MaintenanceError);
    await alone.release();
  });

  it('an expired lease is deleted, never in the way; its times are the database clock’s', async () => {
    const { a, b } = await kind.open();
    const short = await takeLease(a, 'serving', { ttlMs: 80, instanceId: 'crashed' });
    await crash(kind.name, b);
    const [row] = await a.leaseDb.all("SELECT acquired_at, expires_at FROM maintenance WHERE instance_id = 'crashed'");
    expect(Number(row!.expires_at) - Number(row!.acquired_at)).toBe(80);
    expect(Math.abs(Number(row!.acquired_at) - Date.now())).toBeLessThan(60_000);
    await new Promise((r) => setTimeout(r, 200));
    // The crashed holder never released it: the restore takes the store anyway, the old row gone.
    const restore = await takeLease(b, 'exclusive', { ttlMs: 60_000 });
    expect(await short.renew()).toBe(false);
    expect((await a.leaseDb.all("SELECT 1 FROM maintenance WHERE instance_id = 'crashed'")).length).toBe(0);
    await restore.release();
    // The dead holder's connection back to its pool (a killed process would have taken it with it).
    await short.release();
  });

  it('a lease lost holds the store’s writes (readiness fails, writes answer 503) until it is taken again', async () => {
    const { a, b } = await kind.open();
    const kept = await keepLease(a, 'serving', { ttlMs: 150, instanceId: 'serve-kept' });
    expect(await kept.lease().renew()).toBe(true);
    // Lost: on SQLite, it expired and a restore took the store meanwhile; on Postgres, its lock's connection dropped.
    let restore: Awaited<ReturnType<typeof takeLease>> | undefined;
    if (kind.name === 'postgres') await crash(kind.name, b);
    else {
      await a.leaseDb.run('DELETE FROM maintenance');
      restore = await takeLease(b, 'exclusive', { ttlMs: 60_000, instanceId: 'restore-meanwhile' });
    }
    await until(() => a.heldBecause !== undefined);
    await expect(a.ping()).rejects.toThrow(WritesHeldError);
    await expect(a.db.tx(undefined, async (q) => q.run('DELETE FROM daily_kv'))).rejects.toThrow(WritesHeldError);
    // Reads still answer; the restore done, the lease taken again lets writes go.
    await expect(a.db.all('SELECT 1 AS one')).resolves.toHaveLength(1);
    await restore?.release();
    await until(() => a.heldBecause === undefined);
    await expect(a.ping()).resolves.toBeUndefined();
    await kept.stop();
    expect((await a.leaseDb.all('SELECT 1 FROM maintenance')).length).toBe(0);
  });

  it('restore refuses at once while a Bridge serves the store; once it stops, restores', async () => {
    const { a, url } = await kind.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    const out = join(dir, 'b.json');
    expect((await cli(['backup', `--dir=${dir}`, `--store=${url}`, `--out=${out}`])).code).toBe(0);
    const serving = await keepLease(a, 'serving', { ttlMs: 60_000, instanceId: 'serve-live' });
    const refused = await cli([
      'restore',
      `--dir=${dir}`,
      `--store=${url}`,
      `--from=${out}`,
      '--mode=merge',
      '--lock-timeout=500',
    ]);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/in use.*serve-live.*nothing restored/s);
    await serving.stop();
    const ok = await cli(['restore', `--dir=${dir}`, `--store=${url}`, `--from=${out}`, '--mode=merge', '--force']);
    expect(ok.code, ok.out).toBe(0);
  });

  it('serve does not start while a restore holds the store; a migration down takes it alone', async () => {
    const { a, url } = await kind.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    const restore = await takeLease(a, 'exclusive', { ttlMs: 60_000, instanceId: 'restore-live' });
    await expect(
      openStore(url, dir, { journal: 'bridge.jsonl' } as never, {
        lease: 'serving',
        leaseMs: LEASE_MS.serve,
        lockTimeoutMs: 500,
      }),
    ).rejects.toThrow(/maintenance.*restore-live/);
    await restore.release();
    const serving = await keepLease(a, 'serving', { ttlMs: 60_000, instanceId: 'serve-live' });
    const down = await cli(['migrate', `--dir=${dir}`, `--store=${url}`, '--schema=4', '--lock-timeout=500']);
    expect(down.code).toBe(1);
    expect(down.out).toMatch(/in use.*serve-live.*nothing migrated/s);
    expect(await a.schemaVersion()).toBe(5);
    await serving.stop();
  });

  it('a restore whose lease is lost before its commit is rolled back', async () => {
    const { a } = await kind.open();
    const before = stableJson((await makeBackup(a)).payload);
    const p = {
      tenants: [
        {
          tenantId: 't-x',
          players: [],
          signals: [],
          acks: [],
          revokedTokens: ['tok'],
          keys: [],
          quarantine: [],
          pairings: [],
        },
      ],
      runs: [],
      daily: [],
      quotas: [],
    };
    const r = await restoreBackup(a, p, {
      force: false,
      carriesRuns: true,
      carriesQuotas: true,
      stillHeld: () => 'the maintenance lease restore-1 is lost',
    });
    expect(r).toEqual({ ok: false, why: 'the maintenance lease restore-1 is lost' });
    expect(stableJson((await makeBackup(a)).payload)).toBe(before);
  });
});
