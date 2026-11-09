// A check that runs on the processing worker (solve, lint, playtests, validate) packs the game folder when it is
// called: the instance's lock is held for that pack, not for the worker's run. A write made meanwhile, and the reads
// queued behind it, do not wait for a 45-second solve; the solve still answers for the revision it was packed at.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { studioServer } from '../studio-server/src/server/http';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { packSnapshot } from '../studio-server/src/worker/snapshot';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, base: string, close: () => Promise<void>;
let journal: Journal;
let release!: () => void;
const worker = new Promise<void>((ok) => (release = ok));
let onPacked!: () => void;
const packed = new Promise<void>((ok) => (onPacked = ok));

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-solve-'));
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'db.sqlite'));
  journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
  const lease = new ServiceLease(db, 30_000, 10_000);
  await lease.tick();
  // The remote executor's shape: the snapshot packed at the call, the worker's answer held until the test lets it go.
  const executor = {
    validate: async () => ({ ok: true, errors: [], warnings: [], ms: 0 }),
    load: (d: string) => importInChild(join(d, 'index.ts')),
    diagnose: (_kind: string, d: string) => {
      const snapshot = packSnapshot(d).toString('utf8');
      onPacked();
      return worker.then(() => ({ sawLaterNote: snapshot.includes('written during the solve') }));
    },
  };
  const studio = createStudio({ gameDir: game, root: tmp, journal, executor, author: 'test' });
  const server = studioServer({ studio, journal, db, lease, packedReads: true, log: () => {} });
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
  release();
  await close();
  rmSync(tmp, { recursive: true, force: true });
});

it('lets a write and the reads behind it through while a solve runs on the worker', async () => {
  const startRev = await journal.revision();
  let solved = false;
  const solving = fetch(`${base}/api/solve`, { method: 'POST', body: '{}' }).then(async (r) => {
    solved = true;
    return { rev: Number(r.headers.get('x-studio-revision')), body: await r.json() };
  });
  // The solve has reached the worker (its pack is done) before the write is sent.
  await packed;
  const written = await fetch(`${base}/api/notes`, {
    method: 'POST',
    body: JSON.stringify({ text: 'written during the solve' }),
  });
  expect(written.status).toBe(200);
  const read = await fetch(`${base}/api/notes`);
  expect(read.status).toBe(200);
  expect(JSON.stringify(await read.json())).toContain('written during the solve');
  expect(solved).toBe(false);
  release();
  expect(await solving).toEqual({ rev: startRev, body: { sawLaterNote: false } });
}, 60_000);
