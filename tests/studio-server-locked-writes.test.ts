// A Git import and the engine's upgrade write several files as one operation, outside any request: they go through
// the server's `write`, which holds the instance's lock alone, so a read made meanwhile waits and sees the whole
// revision (code, layout and its x-studio-revision header from the same one), never half of it.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { studioServer } from '../studio-server/src/server/http';
import { ServiceLease } from '../studio-server/src/server/service-lease';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, close: () => Promise<void>;
let server: ReturnType<typeof studioServer>, journal: Journal;
let gate: Promise<void> = Promise.resolve();

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-locked-'));
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'db.sqlite'));
  journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
  const lease = new ServiceLease(db, 30_000, 10_000);
  await lease.tick();
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
  // The write is held at its start until the test lets it go: a read issued meanwhile must wait for it.
  const slow = {
    ...studio,
    writeFiles: async (...a: Parameters<typeof studio.writeFiles>) => (await gate, studio.writeFiles(...a)),
  };
  server = studioServer({ studio: slow, journal, db, lease, log: () => {} });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    server.close();
    await lease.release();
    await journal.close();
    await db.close();
  };
}, 60_000);
afterAll(async () => {
  await close();
  rmSync(tmp, { recursive: true, force: true });
});

it('makes a read issued during an import or an upgrade wait for its whole revision', async () => {
  const layout = JSON.parse(readFileSync(join(tmp, 'game', 'layout', 'start.json'), 'utf8'));
  const next = { ...layout, imported: true };
  let release!: () => void;
  gate = new Promise((ok) => (release = ok));
  const writing = server.write('import from git', [{ path: 'layout/start.json', after: JSON.stringify(next) }], {
    undo: false,
  });
  let answered = false;
  const reading = fetch(`${base}/api/room/start`).then(async (r) => {
    answered = true;
    return { rev: Number(r.headers.get('x-studio-revision')), body: (await r.json()) as { layout: unknown } };
  });
  await new Promise((ok) => setTimeout(ok, 300));
  expect(answered).toBe(false);
  release();
  const rev = await writing;
  const read = await reading;
  expect(rev).toBe(await journal.revision());
  expect(read).toEqual({ rev, body: expect.objectContaining({ layout: next }) });
}, 60_000);
