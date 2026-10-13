// Maintenance leases (4.1.20 PR 1c, ADR 0023, plan §6.4): who writes the store, and the one operation that must have
// it alone. Before them, a restore trusted the operator to stop every instance; SQLite runs several processes on one
// file and Postgres several hosts, and a file of PIDs locks nothing. The `maintenance` table (migration 0005) holds one
// row per lease: `serving` (`serve`, a command that writes) or `exclusive` (a restore, a migration down), with a lease
// that expires. Every time comes from the database's clock (`clock_timestamp()`, not `now()`, frozen in a transaction;
// SQLite's `unixepoch('subsec')`), never an instance's. A live lease in the way is refused at once, never waited for;
// an expired one is deleted in the same transaction. On Postgres an advisory lock rides beside the lease, on a
// connection of its own: shared by `serve`, exclusive for a restore, tried for a bounded time, taken before the lease
// everywhere (one order, no deadlock).
import { randomBytes } from 'node:crypto';
import type { SqlDb, SqlQuery } from './store-sql';

export type LeaseKind = 'serving' | 'exclusive';

/** A lease refused: who holds the store, until when (the database's milliseconds). */
export class MaintenanceError extends Error {}

/** The database's clock, in milliseconds since the epoch, as an expression of its dialect. */
const dbNow = (dialect: SqlDb['dialect']) =>
  dialect === 'postgres'
    ? '(extract(epoch FROM clock_timestamp()) * 1000)::bigint'
    : "CAST(unixepoch('subsec') * 1000 AS INTEGER)";

export interface Lease {
  readonly instanceId: string;
  readonly kind: LeaseKind;
  /** Resolves with the error when the advisory lock's connection drops (Postgres); never otherwise. */
  readonly lost: Promise<Error>;
  /** Pushes the expiry `ttlMs` past the database's now; false when the lease is gone (expired, then taken over). */
  renew(): Promise<boolean>;
  release(): Promise<void>;
}

/** The advisory lock held beside a lease (Postgres): released with it; `lost` resolves if its connection drops. */
export interface HeldLock {
  release(): Promise<void>;
  lost: Promise<Error>;
}

/**
 * What a store must offer to lease: its database as it is (never the write guard: a lease is renewed and released
 * precisely while writes are held), and on Postgres the advisory lock beside the lease.
 */
export interface Leasable {
  readonly leaseDb: SqlDb;
  maintenanceLock?(kind: LeaseKind, o: { timeoutMs: number }): Promise<HeldLock>;
}

const describe = (rows: Record<string, unknown>[]) =>
  rows.map((r) => `${String(r.instance_id)} (${String(r.kind)}, until ${Number(r.expires_at)})`).join(', ');

/**
 * Takes a lease of `kind` for `ttlMs`, in one transaction under the maintenance lock key: expired leases deleted, then
 * refused if one in the way is alive (an exclusive one for anyone; any for an exclusive one), else inserted.
 */
export async function takeLease(
  store: Leasable,
  kind: LeaseKind,
  o: { ttlMs: number; instanceId?: string; lockTimeoutMs?: number },
): Promise<Lease> {
  const id = o.instanceId ?? `${kind}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const now = dbNow(store.leaseDb.dialect);
  let lock: HeldLock | undefined;
  try {
    lock = await store.maintenanceLock?.(kind, { timeoutMs: o.lockTimeoutMs ?? 30_000 });
  } catch (e) {
    // Refused by the advisory lock (Postgres): who holds the store is in the lease table, said with the refusal.
    if (!(e instanceof MaintenanceError)) throw e;
    const live = await store.leaseDb
      .all(`SELECT instance_id, kind, expires_at FROM maintenance WHERE expires_at >= ${now} ORDER BY instance_id`)
      .catch(() => []);
    throw new MaintenanceError(
      live.length
        ? kind === 'exclusive'
          ? `the store is in use: ${describe(live)}; stop every Bridge instance and writing command, or wait for their leases to expire`
          : `the store is in maintenance: ${describe(live)}; wait for it to finish`
        : e.message,
    );
  }
  try {
    await store.leaseDb.tx('maintenance', async (q: SqlQuery) => {
      await q.run(`DELETE FROM maintenance WHERE expires_at < ${now}`);
      const live = await q.all(
        `SELECT instance_id, kind, expires_at FROM maintenance WHERE ${kind === 'exclusive' ? '1 = 1' : "kind = 'exclusive'"} ORDER BY instance_id`,
      );
      if (live.length)
        throw new MaintenanceError(
          kind === 'exclusive'
            ? `the store is in use: ${describe(live)}; stop every Bridge instance and writing command, or wait for their leases to expire`
            : `the store is in maintenance: ${describe(live)}; wait for it to finish`,
        );
      // The clock read once: the lease lives exactly `ttlMs` from its start.
      await q.run(
        `INSERT INTO maintenance (instance_id, kind, acquired_at, expires_at) SELECT $1, $2, t, t + $3 FROM (SELECT ${now} AS t) AS clock`,
        [id, kind, o.ttlMs],
      );
    });
  } catch (e) {
    await lock?.release();
    throw e;
  }
  return {
    instanceId: id,
    kind,
    lost: lock?.lost ?? new Promise<Error>(() => {}),
    renew: async () =>
      (await store.leaseDb.run(`UPDATE maintenance SET expires_at = ${now} + $2 WHERE instance_id = $1 AND kind = $3`, [
        id,
        o.ttlMs,
        kind,
      ])) === 1,
    release: async () => {
      try {
        await store.leaseDb.run('DELETE FROM maintenance WHERE instance_id = $1', [id]);
      } finally {
        await lock?.release();
      }
    },
  };
}

/**
 * Takes a lease and keeps it (`serve`, a writing command, a restore): renewed every third of its life. A renewal that
 * fails, or the advisory lock's connection dropping, holds the store's writes (`/readyz` fails, writes answer 503)
 * until a new lease is taken; `stop` releases it. The store is any SQL store (`holdWrites`).
 */
export async function keepLease(
  store: Leasable & { holdWrites(why: string | undefined): void },
  kind: LeaseKind,
  o: { ttlMs: number; instanceId?: string; lockTimeoutMs?: number; onEvent?: (e: Record<string, unknown>) => void },
): Promise<{ lease: () => Lease; stop(): Promise<void> }> {
  let lease = await takeLease(store, kind, o);
  let stopped = false;
  // Lost (a renewal refused, the lock's connection dropped): writes held, and every tick tries a new lease.
  let held = false;
  const lose = (why: string) => {
    if (held) return;
    held = true;
    store.holdWrites(`the maintenance lease ${lease.instanceId} is lost (${why}): writes held until it is taken again`);
    o.onEvent?.({ event: 'maintenance.lease.lost', instance: lease.instanceId, why });
  };
  const watchLock = (l: Lease) => void l.lost.then((e) => !stopped && lease === l && lose(String(e.message ?? e)));
  watchLock(lease);
  const timer = setInterval(
    async () => {
      if (stopped) return;
      try {
        if (!held) {
          if (await lease.renew()) return;
          lose('not renewed');
        }
        await lease.release().catch(() => {});
        lease = await takeLease(store, kind, o);
        watchLock(lease);
        held = false;
        store.holdWrites(undefined);
        o.onEvent?.({ event: 'maintenance.lease.taken', instance: lease.instanceId });
      } catch (e) {
        lose(String((e as Error).message ?? e));
      }
    },
    Math.max(50, Math.floor(o.ttlMs / 3)),
  );
  timer.unref?.();
  return {
    lease: () => lease,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await lease.release().catch(() => {});
    },
  };
}
