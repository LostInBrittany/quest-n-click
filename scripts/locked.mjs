// The archives that carry their own lock, npm-shrinkwrap.json (next, #546): the Bridge, the connectors and the Studio
// Server, the published packages scripts/pack-manifests.mjs keeps a lock for. npm 12 leaves that file out of the
// archive `npm pack` writes; npm 10 and 11 keep it. scripts/pack.mjs checks each archive right after packing it
// (`shrinkwrapProblem`), and scripts/sbom.mjs reads the root lock for the engine only (`sbomLock`): an archive without
// its lock stops both, instead of shipping unlocked or getting the root lock's SBOM in silence. Under scripts/, beside
// its two users: tools/ ships in the engine and imports nothing from scripts/.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { PACKAGES } from '../tools/release/artifacts.mjs';
import { LOCKED as LOCKS } from './pack-manifests.mjs';

/** The archive names (`quest-n-click-bridge`, …) of the published packages that carry their own lock. */
export const LOCKED = PACKAGES.filter((p) => LOCKS.some((l) => l.name === p.npm)).map((p) => p.name);

/** The engine's archive name: the one package whose SBOM reads the root lock. */
const ENGINE = PACKAGES.find((p) => p.npm === '@quest-n-click/engine').name;

/** Where `npm pack` puts the lock in an archive. */
const SHRINKWRAP = 'package/npm-shrinkwrap.json';

/**
 * The files of an archive (`package/package.json`, …; tar always writes `/`), its folders left out. `tar` runs from
 * the archive's folder with a bare file name: Git for Windows' GNU tar reads `C:\…` as a remote host.
 */
export function archiveEntries(tgz) {
  return execFileSync('tar', ['-tzf', basename(tgz)], { cwd: dirname(tgz), encoding: 'utf8' })
    .split(/\r?\n/)
    .map((e) => e.replace(/^\.\//, ''))
    .filter((e) => e && !e.endsWith('/'));
}

/** What is wrong with an archive's files, or null: a locked one without its shrinkwrap, with the npm that packed it. */
export function shrinkwrapProblem(name, entries, npmVersion) {
  if (!LOCKED.includes(name) || entries.includes(SHRINKWRAP)) return null;
  return `${name}: the archive has no ${SHRINKWRAP}, its lock (packed by npm ${npmVersion}; npm 12 leaves it out)`;
}

/**
 * Which lock an unpacked archive's SBOM reads: `own`, its npm-shrinkwrap.json; `root`, the root lock, for the engine
 * only. A locked archive without its shrinkwrap throws, and so does any other archive without one.
 */
export function sbomLock(name, dir) {
  if (existsSync(join(dir, 'npm-shrinkwrap.json'))) return 'own';
  if (LOCKED.includes(name))
    throw new Error(`${name}: the archive has no npm-shrinkwrap.json, its lock; its SBOM would read the root lock`);
  if (name === ENGINE) return 'root';
  throw new Error(`${name}: no npm-shrinkwrap.json, and only the engine's SBOM reads the root lock`);
}
