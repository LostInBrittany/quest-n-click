// navmesh 2.3.1, vendored (next): its package declared a git dependency (javascript-astar), which npm 12 refuses by
// default (`allow-git` = none, EALLOWGIT), in this repository's `npm ci` and in a game's install of the engine. The
// engine carries its build instead (src/engine/core/nav/navmesh/README.md). Checked here: the vendored line is
// upstream's, byte for byte; it runs as an ES module; and no lock of the repository takes a package from git again.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NavMesh } from '@engine/core/nav/navmesh/navmesh.js';

const DIR = 'src/engine/core/nav/navmesh';
/** navmesh-2.3.1.tgz's package/dist/navmesh.js. */
const UPSTREAM_SHA256 = '6c3058be1dd813059b2d52bc2063eed97618b4cee8d59cbd61bc0565f8d217f3';

describe('the vendored navmesh', () => {
  it("is upstream's dist/navmesh.js, byte for byte, between its markers", () => {
    const lines = readFileSync(join(DIR, 'navmesh.js'), 'utf8').split('\n');
    const start = lines.findIndex((l) => l.startsWith('// ---- upstream navmesh@2.3.1'));
    const end = lines.findIndex((l) => l === '// ---- end of upstream ----');
    expect(end - start).toBe(2);
    const upstream = `${lines[start + 1]}\n//# sourceMappingURL=navmesh.js.map`;
    expect(createHash('sha256').update(upstream).digest('hex')).toBe(UPSTREAM_SHA256);
  });

  it('runs as an ES module and finds a path across two polygons', () => {
    const mesh = new NavMesh([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
      ],
    ]);
    expect(mesh.isPointInMesh({ x: 15, y: 5 })).toBe(true);
    expect(mesh.isPointInMesh({ x: 25, y: 5 })).toBe(false);
    expect(mesh.findPath({ x: 1, y: 1 }, { x: 19, y: 9 })?.map((p) => [p.x, p.y])).toEqual([
      [1, 1],
      [19, 9],
    ]);
    expect(mesh.findPath({ x: 1, y: 1 }, { x: 25, y: 5 })).toBeNull();
  });

  it('names its version and licence where the notices and the SBOM read them', () => {
    const [v] = JSON.parse(readFileSync(join(DIR, 'vendored.json'), 'utf8'));
    expect([v.name, v.version, v.licence]).toEqual(['navmesh', '2.3.1', 'MIT']);
    const licence = readFileSync(v.notice, 'utf8');
    expect(licence).toContain('Copyright (c) 2017 Michael Hadley');
    expect(licence).toContain('Copyright (c) Brian Grinstead');
  });
});

/** A spec npm fetches from git: `github:`, `git+…`, `git://`, or the `user/repo` shorthand. */
const GIT_SPEC = /^(github:|gitlab:|bitbucket:|git\+|git:\/\/)|^[\w.-]+\/[\w.-]+(#.*)?$/;

/** Every package of a lock taken from git, resolved or declared. */
function gitSourced(file: string): string[] {
  const lock = JSON.parse(readFileSync(file, 'utf8')) as {
    packages: Record<string, { resolved?: string; link?: boolean; [k: string]: unknown }>;
  };
  const bad: string[] = [];
  for (const [path, p] of Object.entries(lock.packages)) {
    if (p.resolved?.startsWith('git')) bad.push(`${file}: ${path} resolved ${p.resolved}`);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'])
      for (const [name, spec] of Object.entries((p[field] ?? {}) as Record<string, string>))
        if (GIT_SPEC.test(spec)) bad.push(`${file}: ${path || '(root)'} ${field} ${name}@${spec}`);
  }
  return bad;
}

describe('no package from git (npm 12 refuses them)', () => {
  const locks = ['package-lock.json', ...readdirSync('scripts/locks').map((f) => join('scripts/locks', f))];

  it.each(locks)('%s resolves and declares no git dependency', (file) => {
    expect(gitSourced(file)).toEqual([]);
  });

  it('the spec test catches the forms npm reads as git, and no registry range', () => {
    for (const s of [
      'github:mikewesthad/javascript-astar',
      'git+ssh://git@github.com/a/b.git#c0ffee',
      'git://github.com/a/b',
      'mikewesthad/javascript-astar',
      'a/b#v1',
    ])
      expect(GIT_SPEC.test(s), s).toBe(true);
    for (const s of ['^2.3.1', '3', '*', 'npm:zod@^4', 'latest', '>=1 <2', '$nan'])
      expect(GIT_SPEC.test(s), s).toBe(false);
  });
});
