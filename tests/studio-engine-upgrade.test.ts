// The engine's upgrade of a hosted game (4.2.3 PR 8, H6), on a game in the format of a 4.1.x
// (tests/fixtures/game-4.1: schema 2, no stable ids). A game that migrates becomes one revision of the journal and its
// health stays green; a game the migration would break is refused before anything is written, the head intact; the
// migration is taken back by the owner's personal undo, or by restoring a backup taken before, to the head and the
// health of before. The migration and the judge run in the worker's child (localMigrate, localValidate, localDiagnose)
// as on the processing worker; the refusals the solver alone would give are tested with an injected judge.
import { EventEmitter } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate as migrateDb } from '../bridge/src/migrations';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { backupOf, checkBackup, restoreInto } from '../studio-server/src/ops/backup';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { HOSTED_SOLVE_MS } from '../studio-server/src/ops/diagnose';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { finishRestore } from '../studio-server/src/ops/ship';
import { spansOf } from '../studio-server/src/ops/spans';
import { PersonalUndo } from '../studio-server/src/ops/undo';
import { Gate } from '../studio-server/src/server/auth/gate';
import { EngineUpgrade } from '../studio-server/src/server/engine-upgrade';
import { judgeBy, type Verdict } from '../studio-server/src/server/health';
import { studioServer } from '../studio-server/src/server/http';
import { Leases } from '../studio-server/src/server/leases';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { localDiagnose, localMigrate, localValidate } from '../studio-server/src/worker/local';
import { migratedShape } from '../studio-server/src/worker/migrate';
import { addSchema3ToGameSource } from '../tools/ids/codemod';
import { overlaySnapshot, packSnapshot, snapshotTexts } from '../studio-server/src/worker/snapshot';
import type { SolveData } from '../tools/studio/types';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'game-4.1');
const MIGRATIONS = new URL('../studio-server/migrations/', import.meta.url);
let tmp: string;
const opened: { close: () => Promise<unknown> }[] = [];

beforeAll(() => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-engine-upgrade-'));
});
afterAll(async () => {
  // Everything opened is closed before the folder goes: Windows deletes no open file.
  for (const o of opened.reverse()) await o.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

/** The worker's judge, as the health and the upgrade use it: the validator, then the solver from a new game. */
const judge = judgeBy({
  validate: (bytes) => localValidate(bytes),
  solve: (bytes) =>
    localDiagnose('solve', bytes, {
      from: null,
      maxStates: 20_000,
      mode: 'witness',
      timeLimitMs: HOSTED_SOLVE_MS,
    }) as Promise<SolveData>,
});

/** A hosted project made of a copy of the fixture, the owner's personal undo, the leases, an upgrade. */
async function project(name: string, o: { judge?: typeof judge; edit?: (dir: string) => void } = {}) {
  const game = join(tmp, name);
  cpSync(FIXTURE, game, { recursive: true });
  o.edit?.(game);
  const db = await openSqliteDb(join(tmp, `${name}.sqlite`));
  await migrateDb(db, { dir: MIGRATIONS });
  const blobs: BlobStore = fsBlobStore(join(tmp, `${name}-blobs`));
  const leases = new Leases(db);
  const journal = await Journal.open({
    db,
    blobs,
    gameDir: game,
    hosted: true,
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
  opened.push(db, journal);
  const personalUndo = new PersonalUndo(db, () => journal.epoch());
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, personalUndo });
  const log: string[] = [];
  const up = new EngineUpgrade({
    snapshot: async () => ({ epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(game) }),
    migrate: (bytes) => localMigrate(bytes),
    judge: o.judge ?? judge,
    write: async (what, files) => {
      await studio.writeFiles(what, files);
      return journal.revision();
    },
    exclusive: async (fn) => {
      const who = operationContext.getStore()!.claimant!;
      await leases.take(who, ['*']);
      log.push('take *');
      try {
        return await fn();
      } finally {
        await leases.release(who.userId, ['*']);
        log.push('release *');
      }
    },
  });
  const as = <T>(u: string, fn: () => Promise<T>) =>
    operationContext.run({ author: u, claimant: { userId: u, name: u } }, fn);
  const files = () => Object.fromEntries(snapshotTexts(packSnapshot(game)));
  const head = async () =>
    (await db.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map(
      (r) => `${r.path}=${r.blob}`,
    );
  return { game, db, blobs, journal, studio, leases, up, as, log, files, head };
}

describe("the engine's upgrade of a game in the format of a 4.1.x", () => {
  it('migrates it as one revision under the exclusive lease, its health green; a second run has nothing to do', async () => {
    const p = await project('ok');
    const before = p.files();
    const health = await judge(packSnapshot(p.game), { epoch: '', rev: 0 });
    expect(health).toMatchObject({ ok: true, errors: [] });
    const rev = await p.journal.revision();
    const r = await p.as('owner', () => p.up.migrate('owner'));
    expect(r).toMatchObject({ revision: rev + 1, schema: { from: 2, to: 3 } });
    expect(r.changed).toBe(4);
    expect(await p.journal.revision()).toBe(rev + 1);
    expect(p.log).toEqual(['take *', 'release *']);
    expect((await p.journal.opAt(rev + 1))?.paths.sort()).toEqual([
      'game.ts',
      'ids.migration.json',
      'ids.paths.json',
      'rooms/start.ts',
    ]);
    const gameTs = readFileSync(join(p.game, 'game.ts'), 'utf8');
    expect(gameTs).toContain('schemaVersion: 3');
    expect(gameTs).toContain('saveVersion: 2');
    expect(gameTs).toContain('migrations: [idsMigration]');
    expect(gameTs).toContain("import idsMigration from './ids.migration.json';");
    expect(readFileSync(join(p.game, 'rooms', 'start.ts'), 'utf8')).toContain("id: 'start.");
    expect(JSON.parse(readFileSync(join(p.game, 'ids.migration.json'), 'utf8'))).toMatchObject({ from: 1 });
    // The head's health after it: green, the validator (schema 3: every id there) and the solver both pass.
    expect(await judge(packSnapshot(p.game), { epoch: '', rev: rev + 1 })).toMatchObject({ ok: true, errors: [] });
    expect(await p.as('owner', () => p.up.migrate('owner'))).toEqual({ changed: 0, schema: { from: 3, to: 3 } });
    expect(await p.journal.revision()).toBe(rev + 1);
    // Taken back by the owner's personal undo: the head of before (one more revision, the history kept), its health.
    expect(await p.as('owner', () => p.studio.undo())).toMatchObject({
      ok: true,
      what: expect.stringMatching(/engine upgrade/),
    });
    expect(p.files()).toEqual(before);
    expect(existsSync(join(p.game, 'ids.migration.json'))).toBe(false);
    expect(await judge(packSnapshot(p.game), { epoch: '', rev: rev + 2 })).toEqual({
      ...health,
      ms: expect.any(Number),
    });
  }, 120_000);

  it('refuses a game the migration would break, before anything is written: the head intact', async () => {
    // A 4.1.x game whose rules are built by code: the tool cannot write their ids, and schema 3 needs them.
    const p = await project('spread', {
      edit: (dir) => {
        const f = join(dir, 'rooms', 'start.ts');
        const code = readFileSync(f, 'utf8');
        writeFileSync(
          f,
          code
            .replace(
              'export default defineRoom({',
              'const gate = [\n  { verb: "use", a: "gate", do: ["A gate."] },\n];\n\nexport default defineRoom({',
            )
            .replace('  on: [\n', '  on: [\n    ...gate,\n'),
        );
      },
    });
    const before = await p.head();
    const rev = await p.journal.revision();
    const e = await p.as('owner', () => p.up.migrate('owner')).catch((x: unknown) => x);
    expect(e).toMatchObject({
      status: 422,
      message: expect.stringMatching(/would break the game.*nothing was written/),
    });
    expect((e as { body: { skipped: string[]; errors: string[] } }).body.skipped.join('\n')).toMatch(/spread/);
    expect((e as { body: { errors: string[] } }).body.errors.join('\n')).toMatch(/id/);
    expect(await p.journal.revision()).toBe(rev);
    expect(await p.head()).toEqual(before);
    expect(readFileSync(join(p.game, 'game.ts'), 'utf8')).not.toContain('schemaVersion: 3');
    // The lease is given back: the others write again.
    expect(p.log).toEqual(['take *', 'release *']);
    expect(await p.leases.list()).toEqual([]);
  }, 120_000);

  it('refuses when the solver fails the migrated game, or cannot judge it, and runs one at a time', async () => {
    let verdict: Verdict = { ok: false, errors: ['the game cannot be finished'], warnings: [], ms: 1 };
    const seen: string[] = [];
    const p = await project('solver', {
      judge: async (bytes) => {
        seen.push(snapshotTexts(bytes).get('game.ts')!.includes('schemaVersion: 3') ? 'migrated' : 'head');
        return verdict;
      },
    });
    const before = await p.head();
    const rev = await p.journal.revision();
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cannot be finished/),
    });
    verdict = { ok: true, errors: [], warnings: [], ms: 1, unknown: 'the solver was cut short (20000 states)' };
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cannot be judged.*cut short/),
    });
    // The judge saw the migrated game, never the head; nothing was written.
    expect(seen).toEqual(['migrated', 'migrated']);
    expect(await p.journal.revision()).toBe(rev);
    expect(await p.head()).toEqual(before);
    verdict = { ok: true, errors: [], warnings: [], ms: 1 };
    const first = p.as('owner', () => p.up.migrate('owner'));
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({ status: 429 });
    expect(await first).toMatchObject({ revision: rev + 1 });
  }, 120_000);

  it('is taken back by restoring a backup taken before: the head and the health of before', async () => {
    const p = await project('backup');
    const health = await judge(packSnapshot(p.game), { epoch: '', rev: 0 });
    const backup = checkBackup(JSON.parse(JSON.stringify(await backupOf(p.db))));
    const before = await p.head();
    await p.as('owner', () => p.up.migrate('owner'));
    expect(await p.head()).not.toEqual(before);
    const fresh = await openSqliteDb(join(tmp, 'restored.sqlite'));
    opened.push(fresh);
    await migrateDb(fresh, { dir: MIGRATIONS });
    await restoreInto(fresh, p.blobs, backup);
    await finishRestore(fresh);
    const game = join(tmp, 'restored');
    mkdirSync(game);
    const j = await Journal.open({ db: fresh, blobs: p.blobs, gameDir: game, hosted: true });
    opened.push(j);
    expect(await j.revision()).toBe(backup.revision);
    expect(
      (await fresh.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map(
        (r) => `${r.path}=${r.blob}`,
      ),
    ).toEqual(before);
    expect(readFileSync(join(game, 'game.ts'), 'utf8')).toBe(readFileSync(join(FIXTURE, 'game.ts'), 'utf8'));
    expect(await judge(packSnapshot(game), { epoch: '', rev: 0 })).toEqual({ ...health, ms: expect.any(Number) });
  }, 120_000);
});

describe("the worker's migrate", () => {
  it('finds nothing to do on a game at schema 3', async () => {
    const m = await localMigrate(packSnapshot(join(ROOT, 'games', '_template')));
    expect(m).toEqual({ schema: { from: 3, to: 3 }, files: {}, skipped: [] });
  }, 60_000);

  it("checks an answer's shape: plain paths of sources and data, bounded", () => {
    const ok = { schema: { from: 2, to: 3 }, files: { 'rooms/a.ts': 'x', 'ids.paths.json': '{}' } };
    expect(migratedShape(ok)).toEqual({ ...ok, skipped: [] });
    for (const bad of [
      null,
      { files: {} },
      { schema: { from: 2, to: 3 }, files: [] },
      { schema: { from: 2, to: 3 }, files: { '../x.ts': '' } },
      { schema: { from: 2, to: 3 }, files: { 'rooms/../x.ts': '' } },
      { schema: { from: 2, to: 3 }, files: { '.env.json': '' } },
      { schema: { from: 2, to: 3 }, files: { 'tests/a.ts': '' } },
      { schema: { from: 2, to: 3 }, files: { 'art/a.png': '' } },
      { schema: { from: 2, to: 3 }, files: { 'a.ts': 3 } },
      { schema: { from: 2, to: 3 }, files: { 'a.ts': 'x'.repeat(9 * 1024 * 1024) } },
    ])
      expect(migratedShape(bad), JSON.stringify(bad).slice(0, 80)).toHaveProperty('refused');
  });

  it("writes game.ts's three lines UPGRADING leaves to the author, or says what it cannot", () => {
    const src = (body: string) =>
      `import { defineGame } from 'web-scumm/content';\n\nexport const game = defineGame({\n${body}\n});\n`;
    const a = addSchema3ToGameSource(src("  id: 'g',\n  saveVersion: 4,"), 4);
    expect(a.skipped).toEqual([]);
    expect(a.code).toBe(
      "import { defineGame } from 'web-scumm/content';\nimport idsMigration from './ids.migration.json';\n\nexport const game = defineGame({\n  schemaVersion: 3,\n  migrations: [idsMigration],\n  id: 'g',\n  saveVersion: 5,\n});\n",
    );
    const b = addSchema3ToGameSource(src('  schemaVersion: 2,\n  saveVersion: 1,\n  migrations: [m1],'), 1);
    expect(b.code).toContain('schemaVersion: 3,\n  saveVersion: 2,\n  migrations: [m1, idsMigration],');
    expect(addSchema3ToGameSource(src('  saveVersion: 1,\n  migrations: [],'), 1).code).toContain(
      'migrations: [idsMigration]',
    );
    expect(addSchema3ToGameSource(src('  saveVersion: 1,\n  migrations: steps,'), 1).code).toContain(
      'migrations: [...steps, idsMigration]',
    );
    const c = addSchema3ToGameSource(src('  saveVersion: V + 1,'), 3);
    expect(c.skipped).toEqual([expect.objectContaining({ path: 'saveVersion', expected: '4' })]);
    expect(addSchema3ToGameSource('export const x = 1;\n', 1).skipped).toHaveLength(1);
  });

  it('overlays a snapshot with the migrated files', () => {
    const s = packSnapshot(FIXTURE);
    const o = snapshotTexts(overlaySnapshot(s, { 'game.ts': 'new', 'ids.paths.json': '{}' }));
    expect(o.get('game.ts')).toBe('new');
    expect(o.get('ids.paths.json')).toBe('{}');
    expect(o.get('rooms/start.ts')).toBe(snapshotTexts(s).get('rooms/start.ts'));
  });
});

describe('the route', () => {
  it("is a hosted Studio's (404 otherwise), an owner's, a POST", async () => {
    const game = join(tmp, 'http-game');
    cpSync(FIXTURE, game, { recursive: true });
    const db = await openSqliteDb(join(tmp, 'http.sqlite'));
    const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'http-blobs')), gameDir: game });
    const lease = new ServiceLease(db, 30_000, 10_000);
    await lease.tick();
    opened.push(db, journal, { close: () => lease.release() });
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const calls: string[] = [];
    const engineUpgrade = {
      migrate: async (by: string) => {
        calls.push(`${by} ${operationContext.getStore()?.claimant?.userId}`);
        return { changed: 4, revision: 2, schema: { from: 2, to: 3 } };
      },
    };
    // A gate that takes the role from a header: the route's own check is what is tested.
    const gate = {
      authenticate: async (req: { headers: Record<string, string | undefined> }) => ({
        role: req.headers['x-role'],
        user: { id: `u-${req.headers['x-role']}`, name: 'Léa', email: 'lea@example.org' },
      }),
      require: Gate.prototype.require,
      revocations: new EventEmitter(),
    };
    const listen = async (o: object) => {
      const s = studioServer({ studio, journal, db, lease, log: () => {}, ...o });
      await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
      opened.push({ close: async () => void s.close() });
      return `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/engine/migrate`;
    };
    const post = (url: string, role?: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(role ? { 'x-role': role } : {}) },
        body: '{}',
      });
    expect((await post(await listen({}))).status).toBe(404);
    const url = await listen({ engineUpgrade, auth: { gate, handle: async () => false } });
    expect((await post(url, 'dev')).status).toBe(403);
    expect((await fetch(url, { headers: { 'x-role': 'owner' } })).status).toBe(404);
    const r = await post(url, 'owner');
    expect(await r.json()).toEqual({ changed: 4, revision: 2, schema: { from: 2, to: 3 } });
    expect(calls).toEqual(['Léa u-owner']);
  }, 60_000);
});
