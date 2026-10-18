// The operation journal, pinned for the mutation set `studio-ops` (4.2.1): hosted mode on SQLite (the folder follows
// the head, adopted contents go to the blobs, repair counts what it rewrote), deletions, a retry of an aborted id, an
// unchanged base, an interrupted operation whose revision does not follow the head, the files the journal follows
// (no dot-files, no folders, a game folder that does not exist yet), paths outside the game, and the lease: expired,
// fenced, waited for then taken, a fence that only grows.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { ABSENT, sha256 } from '../studio-server/src/ops/durable';
import { Journal, LeaseLostError, MaintenanceError } from '../studio-server/src/ops/journal';

let root: string, game: string;
let dbs: { close(): Promise<void> }[] = [];
const openDb = async () => {
  const db = await openSqliteDb(join(root, 'journal.sqlite'));
  dbs.push(db);
  return db;
};
const open = async (o: { holder?: string; leaseWaitMs?: number; leaseMs?: number; hosted?: boolean } = {}) =>
  Journal.open({ db: await openDb(), blobs: fsBlobStore(join(root, 'blobs')), gameDir: game, ...o });
const read = (p: string) => readFileSync(join(game, p), 'utf8');
const blobCount = () =>
  existsSync(join(root, 'blobs')) ? readdirSync(join(root, 'blobs'), { recursive: true }).length : 0;
const write = (j: Journal, path: string, after: string | null, extra: Record<string, unknown> = {}) =>
  j.apply({ author: 'lea', what: 'w', effects: [{ path, after }], respond: (rev) => rev, ...extra });

beforeEach(() => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'journal-mut-'));
  game = join(root, 'game');
  mkdirSync(join(game, 'rooms'), { recursive: true });
  writeFileSync(join(game, 'rooms', 'a.ts'), 'a0');
  writeFileSync(join(game, 'notes.json'), '{}');
});
afterEach(async () => {
  for (const db of dbs) await db.close();
  dbs = [];
  rmSync(root, { recursive: true, force: true });
});

describe('hosted mode (on SQLite)', () => {
  it('is off by default: a file removed outside is adopted as removed, never brought back', async () => {
    const j = await open();
    await j.close();
    rmSync(join(game, 'notes.json'));
    // Local mode keeps no copy of what it adopts: the folder is the author's.
    expect(blobCount()).toBe(0);
    const k = await open();
    await write(k, 'rooms/a.ts', 'a1');
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await k.file('notes.json')).blob).toBe(ABSENT);
    await k.close();
  });

  it('adopts a first import with every content in the blobs, then follows the head, not the folder', async () => {
    const j = await open({ hosted: true });
    for (const c of ['a0', '{}']) expect((await fsBlobStore(join(root, 'blobs')).get(sha256(c))).toString()).toBe(c);
    await write(j, 'rooms/b.ts', 'b1');
    await j.close();
    // The instance's folder is lost and dirtied: reopening rebuilds it from the head.
    rmSync(join(game, 'rooms', 'b.ts'));
    writeFileSync(join(game, 'rooms', 'a.ts'), 'tampered');
    writeFileSync(join(game, 'stray.txt'), 'stray');
    const k = await open({ hosted: true });
    expect(read('rooms/b.ts')).toBe('b1');
    expect(read('rooms/a.ts')).toBe('a0');
    expect(existsSync(join(game, 'stray.txt'))).toBe(false);
    await k.close();
  });

  it('repairs the folder and counts what it rewrote; a deleted file stays deleted; local mode repairs nothing', async () => {
    const j = await open({ hosted: true });
    await write(j, 'notes.json', null);
    writeFileSync(join(game, 'rooms', 'a.ts'), 'tampered');
    writeFileSync(join(game, 'stray.txt'), 'stray');
    expect(await j.reconcile()).toEqual({ written: 1, removed: 1 });
    expect(read('rooms/a.ts')).toBe('a0');
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect(await j.reconcile()).toEqual({ written: 0, removed: 0 });
    await j.close();
    const local = await open();
    writeFileSync(join(game, 'rooms', 'a.ts'), 'mine');
    expect(await local.reconcile()).toEqual({ written: 0, removed: 0 });
    expect(read('rooms/a.ts')).toBe('mine');
    await local.close();
  });

  it('never empties a folder whose project has no head yet', async () => {
    const j = await open({ hosted: true });
    const db = await openDb();
    await db.run('DELETE FROM studio_files');
    expect(await j.materialize()).toEqual({ written: 0, removed: 0 });
    expect(read('rooms/a.ts')).toBe('a0');
    expect(read('notes.json')).toBe('{}');
    await j.close();
  });
});

describe('operations', () => {
  it('a deletion removes the file, stores no blob, and the head says absent', async () => {
    const j = await open();
    const before = blobCount();
    await write(j, 'notes.json', null);
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await j.file('notes.json')).blob).toBe(ABSENT);
    expect(blobCount()).toBe(before);
    await write(j, 'rooms/a.ts', 'a-new');
    expect((await fsBlobStore(join(root, 'blobs')).get(sha256('a-new'))).toString()).toBe('a-new');
    await j.close();
  });

  it('an id whose earlier try was aborted is applied again, once', async () => {
    const j = await open();
    const db = await openDb();
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('try-1', 50, 'lea', 'w', 'aborted', '[]', 0)",
    );
    const r = await write(j, 'rooms/a.ts', 'a1', { id: 'try-1' });
    expect(r.replayed).toBeUndefined();
    expect(read('rooms/a.ts')).toBe('a1');
    expect((await write(j, 'rooms/a.ts', 'a1', { id: 'try-1' })).replayed).toBe(true);
    await j.close();
  });

  it('a base that is still the head is no conflict', async () => {
    const j = await open();
    const head = (await j.file('rooms/a.ts')).rev;
    await write(j, 'rooms/a.ts', 'a1', { base: { 'rooms/a.ts': head } });
    expect(read('rooms/a.ts')).toBe('a1');
    await j.close();
  });

  it('an interrupted operation whose revision does not follow the head puts the project in maintenance', async () => {
    const j = await open();
    await j.close();
    const db = await openDb();
    // Its file already holds the "after": recovery only has to confirm it, and revision 99 does not follow the head.
    writeFileSync(join(game, 'rooms', 'a.ts'), 'a9');
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('gap', 99, 'lea', 'w', 'intent', $1, 0)",
      [JSON.stringify([{ path: 'rooms/a.ts', before: sha256('a0'), after: sha256('a9') }])],
    );
    await expect(open()).rejects.toBeInstanceOf(MaintenanceError);
  });
});

describe('recovery', () => {
  it('rolls an interrupted deletion forward', async () => {
    const j = await open();
    await j.close();
    const db = await openDb();
    const [m] = await db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('del', $1, 'lea', 'w', 'intent', $2, 0)",
      [Number(m!.value) + 1, JSON.stringify([{ path: 'notes.json', before: sha256('{}'), after: ABSENT }])],
    );
    const k = await open();
    expect(existsSync(join(game, 'notes.json'))).toBe(false);
    expect((await k.file('notes.json')).blob).toBe(ABSENT);
    await k.close();
  });
});

describe('the files it follows', () => {
  it.skipIf(process.platform === 'win32')('never a symbolic link', async () => {
    symlinkSync(join(game, 'notes.json'), join(game, 'link.json'));
    const j = await open();
    expect((await j.file('link.json')).blob).toBe(ABSENT);
    await j.close();
  });

  it('sees a file rewritten with another size even when its time did not move, and one whose time moved', async () => {
    const f = join(game, 'rooms', 'a.ts');
    // Whole seconds: a time set twice is then exactly the same (a sub-millisecond time would not survive utimes).
    const t = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    utimesSync(f, t, t);
    const j = await open();
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    writeFileSync(f, 'a-longer-content');
    utimesSync(f, t, t);
    await write(j, 'notes.json', '{"n":1}');
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a-longer-content'));
    // The same size, another time: read again too.
    writeFileSync(f, 'b-longer-content');
    utimesSync(f, t, new Date(t.getTime() + 5_000));
    await write(j, 'notes.json', '{"n":2}');
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('b-longer-content'));
    await j.close();
  });

  it('neither dot-files nor folders; a game folder that does not exist yet is an empty game', async () => {
    writeFileSync(join(game, '.secret'), 'x');
    mkdirSync(join(game, 'empty-dir'));
    const j = await open();
    expect((await j.file('.secret')).blob).toBe(ABSENT);
    expect((await j.file('empty-dir')).blob).toBe(ABSENT);
    expect((await j.file('rooms/a.ts')).blob).toBe(sha256('a0'));
    await j.close();
    rmSync(game, { recursive: true });
    const k = await open();
    expect(await k.revision()).toBeGreaterThan(0);
    await k.close();
  });

  it('refuses a folder as a file, and a path outside the game', async () => {
    const j = await open();
    await expect(write(j, 'rooms', 'x')).rejects.toMatchObject({ status: 409 });
    await expect(write(j, '../escape.ts', 'x')).rejects.toThrow(/not a path in the game/);
    await expect(write(j, '/etc/x', 'x')).rejects.toThrow(/not a path in the game/);
    await j.close();
  });
});

describe('the lease', () => {
  it('an expired lease, another fence, or no lease at all cannot log an operation', async () => {
    for (const forge of [
      'UPDATE studio_lease SET until_ms = 0 WHERE id = 1',
      'UPDATE studio_lease SET fence = fence + 1 WHERE id = 1',
      'DELETE FROM studio_lease',
    ]) {
      const j = await open({ leaseMs: 60_000 });
      const db = await openDb();
      const e = await j
        .apply({
          author: 'lea',
          what: 'w',
          effects: [{ path: 'rooms/a.ts', after: `a-${forge.length}` }],
          guard: async () => {
            await db.run(forge);
          },
          respond: () => 0,
        })
        .catch((x: unknown) => x);
      expect(e, forge).toBeInstanceOf(LeaseLostError);
      expect(read('rooms/a.ts')).toBe('a0');
      await db.run('DELETE FROM studio_lease');
      await j.close();
    }
  });

  it('reads the time on the database: Postgres has its own expression', async () => {
    // A SQLite database that says it is Postgres: the journal must ask for clock_timestamp(), answered here by SQLite.
    const real = await openDb();
    let asked = 0;
    const toSqlite = (sql: string) => {
      if (!sql.includes('clock_timestamp()')) return sql;
      asked++;
      return sql.replaceAll(
        '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT',
        "CAST(unixepoch('subsec') * 1000 AS INTEGER)",
      );
    };
    type Q = {
      all(s: string, p?: unknown[]): Promise<unknown>;
      run(s: string, p?: unknown[]): Promise<unknown>;
      exec(s: string): Promise<void>;
    };
    const wrap = (q: Q) => ({
      all: (sql: string, p?: unknown[]) => q.all(toSqlite(sql), p),
      run: (sql: string, p?: unknown[]) => q.run(toSqlite(sql), p),
      exec: (sql: string) => q.exec(toSqlite(sql)),
    });
    const pg = {
      ...wrap(real),
      dialect: 'postgres' as const,
      tx: (k: string | undefined, fn: (q: unknown) => Promise<unknown>, o?: unknown) =>
        real.tx(k, (q) => fn(wrap(q)), o as never),
      close: () => real.close(),
    };
    const j = await Journal.open({ db: pg as never, blobs: fsBlobStore(join(root, 'blobs')), gameDir: game });
    await write(j, 'rooms/a.ts', 'a1');
    expect(asked).toBeGreaterThan(0);
    await j.close();
  });

  it('waits for another writer, takes the lease once it is free, and its fence only grows', async () => {
    const j = await open({ leaseWaitMs: 3_000 });
    const db = await openDb();
    // Another process holds the lease (fence 5) for a minute, then lets it go after 400 ms.
    await db.run('DELETE FROM studio_lease');
    await db.run("INSERT INTO studio_lease (id, holder, fence, until_ms) VALUES (1, 'other', 5, $1)", [
      Date.now() + 60_000,
    ]);
    setTimeout(() => void db.run("UPDATE studio_lease SET until_ms = 0 WHERE holder = 'other'"), 400);
    let fence = 0;
    const t0 = Date.now();
    await j.apply({
      author: 'lea',
      what: 'w',
      effects: [{ path: 'rooms/a.ts', after: 'a1' }],
      guard: async () => {
        fence = Number((await db.all('SELECT fence FROM studio_lease WHERE id = 1'))[0]?.fence);
      },
      respond: () => 0,
    });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
    expect(read('rooms/a.ts')).toBe('a1');
    expect(fence).toBe(6);
    await j.close();
  });
});
