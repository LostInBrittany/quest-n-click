// The archives that carry their own lock (the Bridge, the connectors, the Studio Server) keep it as
// package/npm-shrinkwrap.json (#546). npm 12 leaves that file out of `npm pack`; npm 10 and 11 keep it. scripts/pack.mjs
// checks each archive right after packing it, and scripts/sbom.mjs reads the root lock for the engine only: a locked
// archive without its shrinkwrap stops both, instead of shipping without its lock or getting the root lock's SBOM.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCKED, archiveEntries, sbomLock, shrinkwrapProblem } from '../scripts/locked.mjs';

const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'locked-'));
  temps.push(d);
  return d;
};
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A small archive shaped like `npm pack`'s: everything under package/. */
function archive(files: string[]): string {
  const d = temp();
  for (const f of files) {
    mkdirSync(join(d, 'package', f, '..'), { recursive: true });
    writeFileSync(join(d, 'package', f), '{}\n');
  }
  // tar from the folder, with a bare file name (Git for Windows' tar reads `C:\…` as a remote host).
  execFileSync('tar', ['-czf', 'a.tgz', 'package'], { cwd: d });
  return join(d, 'a.tgz');
}

/** An unpacked archive's folder. */
function unpacked(files: string[]): string {
  const d = temp();
  for (const f of files) writeFileSync(join(d, f), '{}\n');
  return d;
}

describe('the archives that carry their own lock (#546)', () => {
  it('are the published packages whose lock scripts/pack-manifests.mjs keeps', () => {
    expect([...LOCKED].sort()).toEqual([
      'quest-n-click-bridge',
      'quest-n-click-connectors',
      'quest-n-click-studio-server',
    ]);
  });

  it('lists an archive’s entries', () => {
    const tgz = archive(['package.json', 'npm-shrinkwrap.json', join('lib', 'index.mjs')]);
    expect(archiveEntries(tgz).sort()).toEqual([
      'package/lib/index.mjs',
      'package/npm-shrinkwrap.json',
      'package/package.json',
    ]);
  });
});

describe('the pack’s check, right after `npm pack` (#546)', () => {
  it('stops on a locked archive without its shrinkwrap, naming the archive and the npm that packed it', () => {
    const entries = archiveEntries(archive(['package.json', 'index.mjs']));
    const problem = shrinkwrapProblem('quest-n-click-connectors', entries, '12.2.2');
    expect(problem).toContain('quest-n-click-connectors');
    expect(problem).toContain('package/npm-shrinkwrap.json');
    expect(problem).toContain('npm 12.2.2');
  });

  it('passes a locked archive that carries it', () => {
    const entries = archiveEntries(archive(['package.json', 'npm-shrinkwrap.json']));
    for (const name of LOCKED) expect(shrinkwrapProblem(name, entries, '11.21.0'), name).toBeNull();
  });

  it('passes the engine and its creator, which carry no lock', () => {
    const entries = archiveEntries(archive(['package.json', 'index.mjs']));
    expect(shrinkwrapProblem('quest-n-click', entries, '12.2.2')).toBeNull();
    expect(shrinkwrapProblem('create-quest-n-click', entries, '12.2.2')).toBeNull();
  });
});

describe('the SBOM’s lock (#546)', () => {
  it('is a locked archive’s own shrinkwrap', () => {
    expect(sbomLock('quest-n-click-bridge', unpacked(['package.json', 'npm-shrinkwrap.json']))).toBe('own');
  });

  it('throws for a locked archive without its shrinkwrap, rather than falling back to the root lock', () => {
    const dir = unpacked(['package.json']);
    for (const name of LOCKED) expect(() => sbomLock(name, dir), name).toThrow(name);
    expect(() => sbomLock('quest-n-click-studio-server', dir)).toThrow(/npm-shrinkwrap\.json/);
  });

  it('is the root lock for the engine', () => {
    expect(sbomLock('quest-n-click', unpacked(['package.json']))).toBe('root');
  });

  it('throws for an archive that is neither locked nor the engine', () => {
    expect(() => sbomLock('create-quest-n-click', unpacked(['package.json']))).toThrow('create-quest-n-click');
  });
});
