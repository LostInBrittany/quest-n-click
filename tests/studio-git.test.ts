// The game to and from Git (4.2.3 PR 6, plan H5): a push is one commit of the revisions since the last one, every author
// a `Co-authored-by`; nothing new pushes nothing; a branch moved since, or one the Studio never saw, is refused and the
// remote is left as it was (never forced); an import is one revision, after which a push builds on it. A bare
// repository on the disk stands for the remote.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext, type Studio } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { GitSync } from '../studio-server/src/server/git';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb, journal: Journal, studio: Studio, sync: GitSync, bare: string;
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(cwd, 'gitconfig') },
  }).trim();
/** A write as `who`, as the Studio Server makes it. */
const as = (who: string, path: string, text: string) =>
  operationContext.run({ author: who }, () =>
    studio.writeFiles(`write ${path}`, [{ path, after: text }], { undo: false }),
  );
/** A clone of the remote, to look at it as anyone would. */
function look(): string {
  const d = mkdtempSync(join(tmp, 'look-'));
  git(d, 'clone', '-q', '--branch', 'main', bare, '.');
  return d;
}

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-git-'));
  bare = join(tmp, 'remote.git');
  mkdirSync(bare);
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const blobs = fsBlobStore(join(tmp, 'blobs'));
  journal = await Journal.open({ db, blobs, gameDir: game, hosted: true });
  studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
  sync = new GitSync({
    db,
    blobs,
    gameDir: game,
    config: { remote: bare, branch: 'main', path: 'games/tpl', committer: { name: 'Studio', email: 'studio@test' } },
    workDir: join(tmp, 'work'),
    writeFiles: (what, files) => studio.writeFiles(what, files, { undo: false }),
    exclusive: (fn) => fn(),
  });
}, 60_000);
afterAll(async () => {
  await journal.close();
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('the game to and from Git', () => {
  it('pushes one commit of the revisions since the last push, each author co-authoring it', async () => {
    await as('lea@example.org', 'notes.md', 'one');
    await as('Tom', 'notes.md', 'two');
    const r = await sync.push();
    expect(r.pushed).toBe(true);
    expect(r.revisions![1]).toBe(await journal.revision());
    const d = look();
    expect(readFileSync(join(d, 'games', 'tpl', 'notes.md'), 'utf8')).toBe('two');
    expect(readFileSync(join(d, 'games', 'tpl', 'index.ts'), 'utf8')).toContain('');
    const msg = git(d, 'log', '-1', '--format=%B');
    expect(msg).toContain('Co-authored-by: lea <lea@example.org>');
    expect(msg).toContain('Co-authored-by: Tom <Tom@users.web-scumm.invalid>');
    expect(git(d, 'log', '-1', '--format=%an <%ae>')).toBe('Studio <studio@test>');
    expect(await sync.status()).toMatchObject({ branch: 'main', path: 'games/tpl', commit: r.commit });
    // Nothing new: nothing pushed, the same commit.
    expect(await sync.push()).toEqual({ pushed: false, commit: r.commit, revisions: null });
    // Then another batch, on top of the first: a file removed in the game is removed there.
    await as('lea@example.org', 'notes.md', 'three');
    await studio.writeFiles('remove notes', [{ path: 'notes.md', after: null }], { undo: false });
    const r2 = await sync.push();
    const d2 = look();
    expect(git(d2, 'rev-parse', 'HEAD~1')).toBe(r.commit);
    expect(git(d2, 'ls-files')).not.toContain('games/tpl/notes.md');
    expect(r2.revisions![0]).toBe(r.revisions![1] + 1);
  });

  it('refuses a branch that moved since, and leaves it as it was: never forced', async () => {
    const d = look();
    writeFileSync(join(d, 'README.md'), 'someone else');
    git(d, 'add', 'README.md');
    git(d, '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '-q', '-m', 'outside');
    git(d, 'push', '-q', 'origin', 'main');
    const theirs = git(d, 'rev-parse', 'HEAD');
    await as('lea@example.org', 'notes.md', 'four');
    await expect(sync.push()).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/moved since/) });
    expect(git(look(), 'rev-parse', 'HEAD')).toBe(theirs);
  });

  it('imports the branch as one revision, then pushes on top of it', async () => {
    const d = look();
    writeFileSync(join(d, 'games', 'tpl', 'notes.md'), 'from git');
    git(d, 'add', '-A');
    git(d, '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '-q', '-m', 'edited in git');
    git(d, 'push', '-q', 'origin', 'main');
    const before = await journal.revision();
    const r = await sync.import();
    expect(r.commit).toBe(git(d, 'rev-parse', 'HEAD'));
    expect(await journal.revision()).toBe(before + 1);
    expect(readFileSync(join(studio.gameDir, 'notes.md'), 'utf8')).toBe('from git');
    // The README beside the game is not the game's: it stays in the repository.
    await as('lea@example.org', 'notes.md', 'after import');
    const p = await sync.push();
    expect(p.pushed).toBe(true);
    const e = look();
    expect(git(e, 'rev-parse', 'HEAD~1')).toBe(r.commit);
    expect(readFileSync(join(e, 'README.md'), 'utf8')).toBe('someone else');
    // An import that changes nothing writes nothing.
    expect(await sync.import()).toEqual({ commit: p.commit, changed: 0 });
  });

  it('refuses a ref that is not one, a branch the Studio never saw, and a commit without the game', async () => {
    expect(() => sync.import('../etc')).toThrow(/branch name or a commit/);
    await expect(sync.import('no-such-branch')).rejects.toMatchObject({ status: 404 });
    const other = new GitSync({
      db,
      blobs: fsBlobStore(join(tmp, 'blobs')),
      gameDir: studio.gameDir,
      config: { remote: bare, branch: 'main', path: 'games/elsewhere' },
      workDir: join(tmp, 'work2'),
      writeFiles: async () => undefined,
      exclusive: (fn) => fn(),
    });
    await expect(other.import()).rejects.toMatchObject({ status: 422 });
    expect(() => new GitSync({ config: { remote: bare, branch: '-x' } } as never)).toThrow(/branch/);
  });
});

describe('the Git routes', () => {
  it('say the state, push, import; a Studio without a repository says so', async () => {
    const { ServiceLease } = await import('../studio-server/src/server/service-lease');
    const { studioServer } = await import('../studio-server/src/server/http');
    const lease = new ServiceLease(db);
    await lease.tick();
    const serve = async (git?: GitSync) => {
      const s = studioServer({ studio, journal, db, lease, log: () => {}, ...(git ? { git } : {}) });
      await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
      return { s, url: `http://127.0.0.1:${(s.address() as { port: number }).port}/api` };
    };
    const post = (url: string, body: unknown = {}) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const a = await serve(sync);
    expect(await (await fetch(`${a.url}/git`)).json()).toMatchObject({ branch: 'main', path: 'games/tpl' });
    await as('lea@example.org', 'notes.md', 'over http');
    const p = await post(`${a.url}/git/push`);
    expect(p.status).toBe(200);
    expect(await p.json()).toMatchObject({ pushed: true });
    const i = await post(`${a.url}/git/import`, { ref: 'main' });
    expect(await i.json()).toMatchObject({ changed: 0 });
    expect((await post(`${a.url}/git/import`, { ref: '../x' })).status).toBe(400);
    expect((await fetch(`${a.url}/git/push`)).status).toBe(404);
    a.s.close();
    const b = await serve();
    expect((await fetch(`${b.url}/git`)).status).toBe(404);
    b.s.close();
  });
});
