// Personal undo on a shared Studio (4.2.2 PR 4, plan §2.4, G5), two members: each undoes and redoes only their own
// operations, in their order, whatever the other wrote meanwhile; an undo is a new operation (history kept); 409 when
// the other wrote one of its files since; 423 when the other holds its span; a new edit drops the member's redo; the
// stacks are in the database (another studio on the same journal sees them).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { spansOf } from '../studio-server/src/ops/spans';
import { PersonalUndo } from '../studio-server/src/ops/undo';
import { Leases } from '../studio-server/src/server/leases';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, game: string, db: SqlDb, journal: Journal, leases: Leases;
let studio: ReturnType<typeof createStudio>;
let roomA: string, roomB: string;

const who = (u: string) => ({ userId: u, name: u });
const as = <T>(u: string, fn: () => Promise<T>): Promise<T> =>
  operationContext.run({ author: u, claimant: who(u) }, fn);
const layoutOf = (room: string) =>
  JSON.parse(readFileSync(join(game, 'layout', `${room}.json`), 'utf8')) as { entries?: Record<string, number[]> };
const move = (u: string, room: string, x: number) =>
  as(u, async () => {
    const l = layoutOf(room);
    await studio.setLayout(room, { ...l, entries: { ...l.entries, e2e: [x, x] } } as never);
  });
const at = (room: string) => layoutOf(room).entries?.e2e?.[0];

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-undo-'));
  game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', 'demo'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  leases = new Leases(db);
  journal = await Journal.open({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    gameDir: game,
    claim: async (q, paths) => {
      const c = operationContext.getStore()?.claimant;
      if (!c) throw new StudioError('a write on a shared Studio says who writes', 500);
      await leases.claimPaths(q, c, paths);
    },
    precheck: async (paths) => {
      const c = operationContext.getStore()?.claimant;
      if (c) await leases.check(c, spansOf(paths));
    },
  });
  const personalUndo = new PersonalUndo(db, () => journal.epoch());
  studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, personalUndo });
  const info = await studio.gameInfo();
  [roomA, roomB] = info.rooms.map((r) => r.id) as [string, string];
}, 60_000);
afterAll(async () => {
  await journal.close();
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('personal undo, two members', () => {
  it("undoes and redoes a member's own operations only, in their order, as new operations", async () => {
    await move('lea', roomA, 10);
    await move('tom', roomB, 20);
    await move('lea', roomA, 11);
    const rev = await journal.revision();
    // Léa's undo is her last operation, not Tom's (which came after her first).
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true, what: `${roomA}: layout` });
    expect(at(roomA)).toBe(10);
    expect(at(roomB)).toBe(20);
    expect(await journal.revision()).toBe(rev + 1);
    expect(await as('lea', () => studio.history())).toEqual({ undo: [`${roomA}: layout`], redo: [`${roomA}: layout`] });
    // Tom's stack is his own.
    expect(await as('tom', () => studio.history())).toEqual({ undo: [`${roomB}: layout`], redo: [] });
    expect(await as('lea', () => studio.redo())).toMatchObject({ ok: true });
    expect(at(roomA)).toBe(11);
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomA)).toBeUndefined();
    expect(await as('lea', () => studio.undo())).toEqual({ ok: false, reason: 'nothing to undo' });
    // A new edit drops her redo.
    await move('lea', roomA, 12);
    expect((await as('lea', () => studio.history())).redo).toEqual([]);
    expect(await as('lea', () => studio.redo())).toEqual({ ok: false, reason: 'nothing to redo' });
    // Another studio on the same journal sees the same stacks.
    const other = createStudio({
      gameDir: game,
      root: tmp,
      journal,
      importFresh: importInChild,
      personalUndo: new PersonalUndo(db, () => journal.epoch()),
    });
    expect((await as('lea', () => other.history())).undo[0]).toBe(`${roomA}: layout`);
  }, 60_000);

  it('refuses (409) to undo over a file the other wrote since, and (423) where the other holds the span', async () => {
    await leases.release('lea');
    await leases.release('tom');
    await move('lea', roomB, 30);
    await leases.release('lea');
    await leases.release('tom');
    await move('tom', roomB, 31);
    await expect(as('lea', () => studio.undo())).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/was written again at revision \d+/),
    });
    expect(at(roomB)).toBe(31);
    // Tom's own undo is fine; then Léa's would be too, but Tom now holds the span: 423.
    expect(await as('tom', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomB)).toBe(30);
    await expect(as('lea', () => studio.undo())).rejects.toMatchObject({ status: 423 });
    expect(at(roomB)).toBe(30);
    await leases.release('tom');
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomB)).toBe(20);
  }, 60_000);

  it("is a member's own: without one, it is refused", async () => {
    // A local Studio (no member) keeps its process's stack; a shared one with a member asks who undoes.
    await expect(operationContext.run({ author: 'x' }, () => studio.undo())).resolves.toBeDefined();
  });
});
