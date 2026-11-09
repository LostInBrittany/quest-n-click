// An operation id (`x-studio-op`) is its author's: another member who sends the same id gets their own write applied,
// never the first author's answer and nothing written.
import { EventEmitter } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { Gate } from '../studio-server/src/server/auth/gate';
import { studioServer } from '../studio-server/src/server/http';
import { ServiceLease } from '../studio-server/src/server/service-lease';

const ROOT = join(import.meta.dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'studio-op-author-'));
const opened: { close(): unknown }[] = [];
afterAll(async () => {
  for (const o of opened.reverse()) await o.close();
  rmSync(tmp, { recursive: true, force: true });
});

it('a member reusing another member’s operation id gets their own write applied', async () => {
  const game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
  const db = await openSqliteDb(join(tmp, 'j.sqlite'));
  const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
  const lease = new ServiceLease(db);
  await lease.tick();
  opened.push(db, journal, { close: () => lease.release() });
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
  // A gate that takes the member from a header: the replay rule is what is tested, not the login.
  const gate = {
    authenticate: async (req: { headers: Record<string, string | undefined> }) => ({
      role: 'dev',
      user: { id: `u-${req.headers['x-who']}`, name: req.headers['x-who'] },
    }),
    require: Gate.prototype.require,
    revocations: new EventEmitter(),
  };
  const s = studioServer({
    studio,
    journal,
    db,
    lease,
    log: () => {},
    auth: { gate: gate as unknown as Gate, handle: async () => false },
  });
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  opened.push({ close: async () => void s.close() });
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/notes`;
  const note = (who: string, text: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-who': who, 'x-studio-op': 'op-shared-id-2' },
      body: JSON.stringify({ text }),
    });

  expect((await note('a', 'mine')).status).toBe(200);
  // Its own retry is still given the first answer, applied once.
  expect((await note('a', 'mine')).headers.get('x-studio-replayed')).toBe('1');
  const other = await note('b', 'theirs');
  expect(other.status).toBe(200);
  expect(other.headers.get('x-studio-replayed')).toBeNull();
  const { entries } = (await (await fetch(url, { headers: { 'x-who': 'a' } })).json()) as {
    entries: { text: string }[];
  };
  expect(entries.map((n) => n.text).sort()).toEqual(['mine', 'theirs']);
}, 60_000);
