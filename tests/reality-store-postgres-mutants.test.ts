// The Postgres adapter's survivors read one by one (4.1.20 PR 2a, plan §7.2): a transaction tried again only on a
// transient conflict, at most six times, after a back-off of at least 5 ms; the advisory lock taken only when a
// transaction names one; a ROLLBACK that fails releases its client with an Error; a notification without a player
// wakes nobody; an error of a listener already replaced changes nothing; listening again only once, never closed, never
// for nobody; every watcher of a tenant woken; nothing after `close`. A stand-in for `pg`, so each is deterministic.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PgModule, PostgresRealityStore } from '../bridge/src/store-postgres';

type Handler = (x: never) => void;
interface FakeClient {
  handlers: Record<string, Handler>;
  queries: { sql: string; params?: unknown[] }[];
  query(sql: string, params?: unknown[]): Promise<{ rows: never[]; rowCount: number }>;
  release(e?: unknown): void;
  on(ev: string, fn: Handler): void;
}

/** A `pg` whose queries a test scripts: `fail(sql)` returns the error a statement throws (or nothing). */
function fakePg(
  o: { fail?: (sql: string) => unknown; connectFails?: () => boolean; connectWaits?: () => Promise<void> } = {},
) {
  const state = { connects: 0, released: [] as unknown[], clients: [] as FakeClient[] };
  const mod = {
    Pool: class {
      async query() {
        return { rows: [], rowCount: 0 };
      }
      async connect() {
        state.connects++;
        await o.connectWaits?.();
        if (o.connectFails?.()) throw new Error('connect refused');
        const c: FakeClient = {
          handlers: {},
          queries: [],
          async query(sql: string, params?: unknown[]) {
            c.queries.push({ sql, params });
            const e = o.fail?.(sql);
            if (e !== undefined) throw e;
            return { rows: [], rowCount: 0 };
          },
          release: (e?: unknown) => void state.released.push(e),
          on(ev, fn) {
            c.handlers[ev] = fn;
          },
        };
        state.clients.push(c);
        return c;
      }
      async end() {}
      on() {}
    },
  } as unknown as PgModule;
  return { mod, state };
}
const open = (mod: PgModule) => PostgresRealityStore.open('postgres://fake', { pg: mod, migrate: false });
const conflict = (code: string) => Object.assign(new Error(`conflict ${code}`), { code });
const notify = (c: FakeClient, payload: string) =>
  (c.handlers.notification as (m: { channel: string; payload: string }) => void)({
    channel: 'web_scumm_signals',
    payload,
  });
const drop = (c: FakeClient) => (c.handlers.error as (e: Error) => void)(new Error('terminated'));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a transaction on Postgres', () => {
  it('is tried again on a transient conflict, at most six times in all', async () => {
    for (const [fails, ok] of [
      [5, true],
      [6, false],
    ] as const) {
      let left = fails;
      const { mod, state } = fakePg({
        fail: (sql) => (sql === 'SELECT work' && left-- > 0 ? conflict('40001') : undefined),
      });
      const store = await open(mod);
      const run = store.db.tx(undefined, (q) => q.exec('SELECT work'));
      if (ok) await expect(run).resolves.toBeUndefined();
      else await expect(run).rejects.toThrow('conflict 40001');
      expect(state.connects, `${fails} conflicts`).toBe(6);
      expect(store.retries).toBe(5);
      await store.close();
    }
  });

  it('is not tried again on an error that is no transient conflict, with a code or without', async () => {
    for (const e of [conflict('23503'), new Error('syntax')]) {
      const { mod, state } = fakePg({ fail: (sql) => (sql === 'SELECT work' ? e : undefined) });
      const store = await open(mod);
      await expect(store.db.tx(undefined, (q) => q.exec('SELECT work'))).rejects.toBe(e);
      expect(state.connects).toBe(1);
      expect(store.retries).toBe(0);
      await store.close();
    }
  });

  it('waits at least 5 ms before it is tried again (5 to 25 ms)', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let left = 1;
    const { mod, state } = fakePg({
      fail: (sql) => (sql === 'SELECT work' && left-- > 0 ? conflict('40P01') : undefined),
    });
    const store = await open(mod);
    const run = store.db.tx(undefined, (q) => q.exec('SELECT work'));
    await vi.advanceTimersByTimeAsync(14);
    expect(state.connects).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(state.connects).toBe(2);
    await store.close();
  });

  it('takes the advisory lock it names, and none when it names none', async () => {
    const { mod, state } = fakePg();
    const store = await open(mod);
    await store.db.tx('runs:admit:t-a', async () => {});
    await store.db.tx(undefined, async () => {});
    const locks = state.clients.map((c) => c.queries.filter((q) => q.sql.includes('pg_advisory_xact_lock')));
    expect(locks[0]).toEqual([
      { sql: 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', params: ['runs:admit:t-a'] },
    ]);
    expect(locks[1]).toEqual([]);
    await store.close();
  });

  it('whose ROLLBACK fails with something that is not an Error releases its client with an Error', async () => {
    const { mod, state } = fakePg({
      fail: (sql) => (sql === 'SELECT work' ? new Error('work') : sql === 'ROLLBACK' ? 'gone' : undefined),
    });
    const store = await open(mod);
    await expect(store.db.tx(undefined, (q) => q.exec('SELECT work'))).rejects.toThrow('work');
    const released = state.released.at(-1);
    expect(released).toBeInstanceOf(Error);
    expect((released as Error).message).toBe('gone');
    await store.close();
  });
});

describe('listening on Postgres', () => {
  it('wakes every watcher of the tenant, and nobody for a notification without a player', async () => {
    const { mod, state } = fakePg();
    const store = await open(mod);
    const woken: string[] = [];
    store.watch('t-a', (p) => woken.push(`first ${p}`));
    store.watch('t-a', (p) => woken.push(`second ${p}`));
    await store.listening();
    const c = state.clients[0]!;
    for (const payload of ['', 't-a', 't-a ']) notify(c, payload);
    expect(woken).toEqual([]);
    notify(c, 't-a p-1');
    expect(woken).toEqual(['first p-1', 'second p-1']);
    await store.close();
  });

  it('an error of a listener already replaced changes nothing: one connection more, not two', async () => {
    vi.useFakeTimers();
    const { mod, state } = fakePg();
    const store = await open(mod);
    store.watch('t-a', () => {});
    await store.listening();
    const first = state.clients[0]!;
    drop(first);
    await vi.advanceTimersByTimeAsync(300);
    expect(state.connects).toBe(2);
    drop(first);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.connects).toBe(2);
    await store.close();
  });

  it('listens again once while a retry is pending, never for nobody, never once closed', async () => {
    vi.useFakeTimers();
    let refuse = false;
    const { mod, state } = fakePg({ connectFails: () => refuse });
    const store = await open(mod);
    store.watch('t-a', () => {});
    await store.listening();
    // The listener drops and the server refuses: one retry pending, a second failure does not add another.
    refuse = true;
    drop(state.clients[0]!);
    await store.listening().catch(() => {});
    const pending = state.connects;
    await vi.advanceTimersByTimeAsync(250);
    expect(state.connects).toBe(pending + 1);
    // Closed: the retry pending is cleared and nothing listens again.
    await vi.advanceTimersByTimeAsync(10);
    await store.close();
    const closedAt = state.connects;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(state.connects).toBe(closedAt);

    // Nobody watches: a failed listen is not tried again.
    const lone = fakePg({ connectFails: () => true });
    const alone = await open(lone.mod);
    await alone.listening().catch(() => {});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(lone.state.connects).toBe(1);
    await alone.close();
  });

  it('closed while it connects: the connection that lands then drops is not listened again, whoever watches', async () => {
    vi.useFakeTimers();
    let land!: () => void;
    const landed = new Promise<void>((ok) => (land = ok));
    const { mod, state } = fakePg({ connectWaits: () => (state.connects === 1 ? landed : Promise.resolve()) });
    const store = await open(mod);
    store.watch('t-a', () => {});
    const listening = store.listening();
    await store.close();
    // A stream that still asks to be woken after the stop (a request finishing late): a closed store stays closed.
    store.watch('t-b', () => {});
    land();
    await listening;
    drop(state.clients[0]!);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(state.connects).toBe(1);
  });
});
