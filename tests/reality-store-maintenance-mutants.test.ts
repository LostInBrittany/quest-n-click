// The maintenance leases' survivors read one by one (4.1.20 PR 1c, ADR 0023): the database's clock in its dialect; the
// advisory lock's refusal said with who holds the store (in use for a restore, in maintenance for `serve`), its own
// message when nobody does, any other error as it is; a kept lease renewed, lost once, taken again, and nothing after
// `stop`; a read-only transaction runs while writes are held. The Postgres lock over a stand-in for `pg`: shared or
// exclusive, tried every 200 ms until its deadline (and at it), its refusal per kind, released with what broke it.
// Fakes and fake timers throughout: no Postgres, no wall clock.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepLease, type Leasable, MaintenanceError, takeLease } from '../bridge/src/maintenance';
import { type PgModule, PostgresRealityStore } from '../bridge/src/store-postgres';
import { type SqlDb, WritesHeldError } from '../bridge/src/store-sql';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

/** A lease table that answers as a test says: renewals accepted or not, a new lease taken or refused. */
function harness() {
  const s = {
    renew: true,
    takeFails: undefined as Error | undefined,
    sql: [] as string[],
    takes: 0,
    renews: 0,
    held: [] as (string | undefined)[],
    events: [] as string[],
    locks: [] as { drop(e: Error): void }[],
  };
  const leaseDb: SqlDb = {
    dialect: 'sqlite',
    all: async (sql) => {
      s.sql.push(sql);
      return [];
    },
    run: async (sql) => {
      s.sql.push(sql);
      if (!sql.startsWith('UPDATE')) return 1;
      s.renews++;
      return s.renew ? 1 : 0;
    },
    exec: async () => {},
    tx: async (_k, fn) => {
      if (s.takeFails) throw s.takeFails;
      s.takes++;
      return fn(leaseDb);
    },
    close: async () => {},
  };
  const store = {
    leaseDb,
    maintenanceLock: async () => {
      let drop!: (e: Error) => void;
      const lost = new Promise<Error>((ok) => (drop = ok));
      s.locks.push({ drop });
      return { lost, release: async () => {} };
    },
    holdWrites: (why: string | undefined) => void s.held.push(why),
  };
  const keep = () =>
    keepLease(store, 'serving', { ttlMs: 300, instanceId: 'i', onEvent: (e) => void s.events.push(String(e.event)) });
  return { s, store, keep };
}

describe('a lease taken', () => {
  it("reads the database's clock in its dialect", async () => {
    const { s, store } = harness();
    await takeLease({ leaseDb: { ...store.leaseDb, dialect: 'postgres' } }, 'serving', { ttlMs: 1000 });
    expect(s.sql.some((q) => q.includes('clock_timestamp()'))).toBe(true);
    expect(s.sql.some((q) => q.includes('unixepoch'))).toBe(false);
  });

  it('refused by the advisory lock names who holds the store, per kind; its own message when nobody does', async () => {
    const refused = (store: SqliteRealityStore): Leasable => ({
      leaseDb: store.leaseDb,
      maintenanceLock: async () => {
        throw new MaintenanceError('lock held');
      },
    });
    const a = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    await expect(takeLease(refused(a), 'exclusive', { ttlMs: 60_000 })).rejects.toThrow(/^lock held$/);
    await takeLease(a, 'serving', { ttlMs: 60_000, instanceId: 'web-1' });
    const inUse = takeLease(refused(a), 'exclusive', { ttlMs: 60_000 });
    await expect(inUse).rejects.toBeInstanceOf(MaintenanceError);
    await expect(inUse).rejects.toThrow(/^the store is in use: web-1 \(serving, until \d+\); stop every Bridge/);
    await a.close();
    const b = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    await takeLease(b, 'exclusive', { ttlMs: 60_000, instanceId: 'restore-1' });
    await expect(takeLease(refused(b), 'serving', { ttlMs: 60_000 })).rejects.toThrow(
      /^the store is in maintenance: restore-1 \(exclusive, until \d+\); wait for it to finish$/,
    );
    await b.close();
  });

  it('fails with the advisory lock’s own error when that is no refusal', async () => {
    const a = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    const e = new Error('connect refused');
    const store: Leasable = {
      leaseDb: a.leaseDb,
      maintenanceLock: async () => {
        throw e;
      },
    };
    await expect(takeLease(store, 'exclusive', { ttlMs: 60_000 })).rejects.toBe(e);
    await a.close();
  });
});

describe('a lease kept', () => {
  it('is renewed every third of its life, neither held nor taken again', async () => {
    vi.useFakeTimers();
    const { s, keep } = harness();
    const k = await keep();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.renews).toBe(1);
    expect(s.takes).toBe(1);
    expect(s.held).toEqual([]);
    expect(s.events).toEqual([]);
    await k.stop();
  });

  it('refused a renewal, holds writes once; then takes a new lease, lets them go, and renews it', async () => {
    vi.useFakeTimers();
    const { s, keep } = harness();
    const k = await keep();
    s.renew = false;
    s.takeFails = new Error('busy');
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.events).toEqual(['maintenance.lease.lost']);
    expect(s.held).toHaveLength(1);
    expect(s.held[0]).toContain('not renewed');
    // Lost: the next tick takes a new lease, even though the old one would renew now.
    s.renew = true;
    s.takeFails = undefined;
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.events).toEqual(['maintenance.lease.lost', 'maintenance.lease.taken']);
    expect(s.held.at(-1)).toBeUndefined();
    expect(s.takes).toBe(2);
    // Taken again: renewed from then on, not taken a third time.
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.takes).toBe(2);
    expect(s.events).toHaveLength(2);
    await k.stop();
  });

  it("whose lock's connection drops holds writes, then is taken again although it would still renew", async () => {
    vi.useFakeTimers();
    const { s, keep } = harness();
    const k = await keep();
    s.locks[0]?.drop(new Error('terminated'));
    await flush();
    expect(s.events).toEqual(['maintenance.lease.lost']);
    expect(s.held[0]).toContain('terminated');
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.events).toEqual(['maintenance.lease.lost', 'maintenance.lease.taken']);
    expect(s.held).toEqual([s.held[0], undefined]);
    await k.stop();
  });

  it('ignores the lock of a lease it replaced, and every lock after `stop`', async () => {
    vi.useFakeTimers();
    const { s, keep } = harness();
    const k = await keep();
    s.renew = false;
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(s.takes).toBe(2);
    expect(s.held).toHaveLength(2);
    s.locks[0]?.drop(new Error('old connection'));
    await flush();
    expect(s.held).toHaveLength(2);
    await k.stop();
    s.locks[1]?.drop(new Error('after stop'));
    await flush();
    expect(s.held).toHaveLength(2);
    expect(s.events).toEqual(['maintenance.lease.lost', 'maintenance.lease.taken']);
  });
});

describe('the local deadline', () => {
  it('lets writes go at the deadline itself, and holds them just past it', async () => {
    const store = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    const now = vi.spyOn(performance, 'now');
    store.writableUntil(1000);
    now.mockReturnValue(1000);
    expect(store.heldBecause).toBeUndefined();
    now.mockReturnValue(1000.5);
    expect(store.heldBecause).toMatch(/not renewed in time/);
    store.writableUntil(undefined);
    expect(store.heldBecause).toBeUndefined();
    now.mockRestore();
    await store.close();
  });
});

describe('writes held', () => {
  it('still let a read-only transaction run, never a write', async () => {
    const store = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    store.holdWrites('lease lost');
    await expect(store.db.tx(undefined, (q) => q.all('SELECT 1 AS x'), { readOnly: true })).resolves.toEqual([
      { x: 1 },
    ]);
    await expect(store.db.tx(undefined, (q) => q.all('SELECT 1 AS x'))).rejects.toBeInstanceOf(WritesHeldError);
    await store.close();
  });
});

/** A `pg` whose advisory lock answers `tries` in order (false once they run out) and whose unlock may throw. */
function fakePg(tries: boolean[], unlock?: () => unknown) {
  const st = { sql: [] as string[], released: [] as unknown[] };
  const mod = {
    Pool: class {
      async query() {
        return { rows: [], rowCount: 0 };
      }
      async connect() {
        return {
          async query(sql: string) {
            st.sql.push(sql);
            if (sql.includes('pg_try_advisory_lock')) return { rows: [{ ok: tries.shift() ?? false }], rowCount: 1 };
            if (sql.includes('pg_advisory_unlock') && unlock) throw unlock();
            return { rows: [], rowCount: 0 };
          },
          release: (e?: unknown) => void st.released.push(e),
          on() {},
        };
      }
      async end() {}
      on() {}
    },
  } as unknown as PgModule;
  return { st, open: () => PostgresRealityStore.open('postgres://fake', { pg: mod, migrate: false }) };
}
const tries = (st: { sql: string[] }) => st.sql.filter((q) => q.includes('pg_try_advisory_lock')).length;

describe('the maintenance lock on Postgres', () => {
  it('is shared for `serving`, exclusive for a restore, taken and released alike', async () => {
    for (const [kind, suffix] of [
      ['serving', '_shared'],
      ['exclusive', ''],
    ] as const) {
      const { st, open } = fakePg([true]);
      const store = await open();
      const lock = await store.maintenanceLock(kind, { timeoutMs: 0 });
      await lock.release();
      expect(st.sql[0]).toMatch(new RegExp(`^SELECT pg_try_advisory_lock${suffix}\\(hashtextextended`));
      expect(st.sql[1]).toMatch(new RegExp(`^SELECT pg_advisory_unlock${suffix}\\(hashtextextended`));
      expect(st.released).toEqual([undefined]);
      await store.close();
    }
  });

  it('is tried every 200 ms until its deadline', async () => {
    vi.useFakeTimers();
    const { st, open } = fakePg([false, false, true]);
    const store = await open();
    const lock = store.maintenanceLock('exclusive', { timeoutMs: 1000 }).then(
      () => 'taken',
      (e: Error) => e.message,
    );
    await flush();
    expect(tries(st)).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(tries(st)).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(await lock).toBe('taken');
    expect(tries(st)).toBe(3);
    await store.close();
  });

  it('is refused at its deadline, released, and says what holds it per kind', async () => {
    vi.useFakeTimers();
    for (const [kind, why] of [
      ['serving', 'a restore or a migration down is running'],
      ['exclusive', 'the store is served or written'],
    ] as const) {
      // Refused when the clock reads the deadline exactly, although the next try would have taken it.
      const { st, open } = fakePg([false, true]);
      const store = await open();
      const lock = store.maintenanceLock(kind, { timeoutMs: 0 }).then(
        () => 'taken',
        (e: Error) => `${e instanceof MaintenanceError} ${e.message}`,
      );
      await flush();
      await vi.advanceTimersByTimeAsync(200);
      expect(await lock).toBe(`true the maintenance lock is held (${why}): refused after 0 ms`);
      expect(tries(st)).toBe(1);
      expect(st.released).toEqual([undefined]);
      await store.close();
    }
  });

  it('goes back with what broke its unlock: the Error itself, or one made of anything else', async () => {
    const e = new Error('connection terminated');
    const a = fakePg([true], () => e);
    const sa = await a.open();
    await (await sa.maintenanceLock('serving', { timeoutMs: 0 })).release();
    expect(a.st.released).toHaveLength(1);
    expect(a.st.released[0]).toBe(e);
    await sa.close();
    const b = fakePg([true], () => 'gone');
    const sb = await b.open();
    await (await sb.maintenanceLock('serving', { timeoutMs: 0 })).release();
    expect(b.st.released[0]).toBeInstanceOf(Error);
    expect((b.st.released[0] as Error).message).toBe('gone');
    await sb.close();
  });
});

// Second reading of 4.1.20 PR 1c: one renewal at a time (a retake may wait for the lock longer than a tick), a lease
// taken after `stop` released, and a holder that stalls refusing its writes on its own clock.
describe('a lease kept, against its races', () => {
  it('never runs two ticks at once: a slow retake is not doubled, and the old lease is released once', async () => {
    vi.useFakeTimers();
    const { s, store } = harness();
    let releases = 0;
    let attempts = 0;
    let gate!: () => void;
    let slow = false;
    const slowStore = {
      ...store,
      maintenanceLock: async () => {
        attempts++;
        if (slow) await new Promise<void>((ok) => (gate = ok));
        return {
          lost: new Promise<Error>(() => {}),
          release: async () => void releases++,
        };
      },
    };
    const k = await keepLease(slowStore, 'serving', { ttlMs: 300, instanceId: 'i' });
    s.renew = false;
    slow = true;
    // The first tick finds the lease not renewed and waits for the lock; the ticks after it must not start meanwhile.
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    // One retake waiting for the lock: one attempt beside the first lease's, never one per tick.
    expect(attempts).toBe(2);
    expect(releases).toBe(1);
    expect(s.takes).toBe(1);
    gate();
    await flush();
    expect(s.takes).toBe(2);
    await k.stop();
    expect(releases).toBe(2);
  });

  it('stopped while a lease is being taken: that lease is released at once', async () => {
    vi.useFakeTimers();
    const { s, store } = harness();
    let releases = 0;
    let gate!: () => void;
    let slow = false;
    const slowStore = {
      ...store,
      maintenanceLock: async () => {
        if (slow) await new Promise<void>((ok) => (gate = ok));
        return { lost: new Promise<Error>(() => {}), release: async () => void releases++ };
      },
    };
    const events: string[] = [];
    const k = await keepLease(slowStore, 'serving', {
      ttlMs: 300,
      instanceId: 'i',
      onEvent: (e) => void events.push(String(e.event)),
    });
    s.renew = false;
    slow = true;
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    const stopping = k.stop();
    gate();
    await stopping;
    // The first lease, released by the tick; the one taken after stop, released too: none left holding a lock.
    expect(releases).toBe(2);
    // Taken after stop, it is not kept: no lease said taken, and the writes stay held as the loss left them.
    expect(events).toEqual(['maintenance.lease.lost']);
    expect(s.held.at(-1)).toMatch(/lost/);
  });

  it('a holder that stalls refuses its writes on its own clock, before its lease could expire in the database', async () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const a = await SqliteRealityStore.open(':memory:', { pollMs: 0 });
    const k = await keepLease(a, 'serving', { ttlMs: 300, instanceId: 'stalls' });
    expect(a.heldBecause).toBeUndefined();
    await a.db.run('DELETE FROM daily_kv');
    // No tick ran (the event loop was blocked) and two thirds of the lease went by.
    now += 201;
    expect(a.heldBecause).toMatch(/not renewed in time/);
    await expect(a.db.run('DELETE FROM daily_kv')).rejects.toBeInstanceOf(WritesHeldError);
    await expect(a.ping()).rejects.toBeInstanceOf(WritesHeldError);
    await k.stop();
    expect(a.heldBecause).toBeUndefined();
    await a.close();
  });
});
