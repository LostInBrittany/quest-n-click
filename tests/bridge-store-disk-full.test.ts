// The journal on a nearly full disk (#479): `writeSync` may write part of what it is given and say so, then fail. A
// rewrite (compact, forget) must fail before its rename, leaving the journal whole; an append must fail and take its
// cut line back, so the next line never joins it.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { type BridgeEvent, JsonlBridgeStore, type Pairing } from '../bridge/src/store';

const disk = vi.hoisted(() => ({ full: false, short: false, calls: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  // A full disk: the first write takes half of what it is given, the next one fails.
  const writeSync = ((fd: number, data: string | Uint8Array, offset?: number, length?: number) => {
    const half = () => {
      const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data).subarray(offset ?? 0);
      return fs.writeSync(fd, bytes.subarray(0, Math.floor((length ?? bytes.length) / 2)));
    };
    // `short`: the first write takes half, then there is room again; the rest must follow from where it stopped.
    if (disk.short && disk.calls++ === 0) return half();
    if (!disk.full) return (fs.writeSync as (...a: unknown[]) => number)(fd, data, offset, length);
    if (disk.calls++) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    return half();
  }) as typeof fs.writeSync;
  return { ...fs, default: { ...fs, writeSync }, writeSync };
});

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
afterEach(() => {
  disk.full = false;
  disk.short = false;
  disk.calls = 0;
});

function journalPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-disk-full-'));
  temps.push(dir);
  return join(dir, 'journal.jsonl');
}
const pairing = (code: string, expiresAt = 10_000): Pairing => ({ code, gameId: 'signals', expiresAt });
const lines = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BridgeEvent);

describe('JsonlBridgeStore on a full disk', () => {
  it('a write cut short writes the rest from where it stopped: an append, then a compact', () => {
    const file = journalPath();
    const store = new JsonlBridgeStore(file, { lock: false });
    store.write({ t: 'pairing', p: pairing('c-1') });
    disk.short = true;
    store.write({ t: 'pairing', p: pairing('c-2') });
    const both = [
      { t: 'pairing', p: pairing('c-1') },
      { t: 'pairing', p: pairing('c-2') },
    ];
    expect(disk.calls).toBe(2);
    expect(lines(file)).toEqual(both);
    disk.calls = 0;
    store.compact({ now: 0 });
    expect(disk.calls).toBe(2);
    expect(lines(file)).toEqual(both);
  });

  it('a compact that cannot write it all fails, and the journal stays as it was', () => {
    const file = journalPath();
    const store = new JsonlBridgeStore(file, { lock: false });
    for (const c of ['c-1', 'c-2', 'c-3']) store.write({ t: 'pairing', p: pairing(c) });
    const before = readFileSync(file, 'utf8');
    disk.full = true;
    expect(() => store.compact({ now: 0 })).toThrow(/ENOSPC/);
    disk.full = false;
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('an append that cannot write its line fails and takes it back: the next line and a restart read clean', () => {
    const file = journalPath();
    const store = new JsonlBridgeStore(file, { lock: false });
    store.write({ t: 'pairing', p: pairing('c-1') });
    disk.full = true;
    expect(() => store.write({ t: 'pairing', p: pairing('c-lost') })).toThrow(/ENOSPC/);
    disk.full = false;
    store.write({ t: 'pairing', p: pairing('c-2') });
    expect(lines(file)).toEqual([
      { t: 'pairing', p: pairing('c-1') },
      { t: 'pairing', p: pairing('c-2') },
    ]);
    const reopened = new JsonlBridgeStore(file, { lock: false });
    expect(reopened.pairing('c-2')).toEqual(pairing('c-2'));
    expect(reopened.pairing('c-lost')).toBeUndefined();
  });
});
