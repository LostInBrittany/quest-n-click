// What the engine carries instead of a package (navmesh, src/engine/core/nav/navmesh/) reaches the two outputs that
// name third-party code: a build's licenses/THIRD_PARTY_NOTICES.txt (tools/dist.ts) and the engine's CycloneDX SBOM
// (scripts/sbom.mjs), javascript-astar, which navmesh's build contains, as a component of its own. Its record missing
// fails both, rather than leaving navmesh out in silence.
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  VENDORED,
  bundlesText,
  readVendored,
  unnamedVendored,
  vendoredNotices,
  withVendored,
} from '../tools/vendored.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const NAVMESH = 'src/engine/core/nav/navmesh';
const ASTAR_PURL = 'pkg:github/mikewesthad/javascript-astar@c0304b12861eda334e27f2f15d701c10b296593f';

const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'vendored-'));
  temps.push(d);
  return d;
};
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An unpacked engine archive, as far as the vendored code goes: the navmesh folder at its path. */
function engineDir(): string {
  const d = temp();
  cpSync(join(ROOT, NAVMESH), join(d, NAVMESH), { recursive: true });
  return d;
}

/** The shape of what `npm sbom --sbom-format cyclonedx` writes (specVersion 1.5), reduced to one dependency. */
const npmSbom = () => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  metadata: { component: { 'bom-ref': '@quest-n-click/engine@9.9.9', type: 'library', name: '@quest-n-click/engine' } },
  components: [{ 'bom-ref': 'earcut@3.2.4', type: 'library', name: 'earcut', version: '3.2.4' }],
  dependencies: [
    { ref: '@quest-n-click/engine@9.9.9', dependsOn: ['earcut@3.2.4'] },
    { ref: 'earcut@3.2.4', dependsOn: [] },
  ],
});

describe('the record of the vendored code', () => {
  it('names navmesh and, structured, the javascript-astar its build contains', () => {
    const [v] = readVendored(ROOT);
    expect([v.name, v.version, v.licence, v.purl]).toEqual(['navmesh', '2.3.1', 'MIT', 'pkg:npm/navmesh@2.3.1']);
    expect(v.bundled).toEqual([
      expect.objectContaining({ name: 'javascript-astar', version: '0.4.2', licence: 'MIT', purl: ASTAR_PURL }),
    ]);
    expect(bundlesText(v)).toBe(
      'javascript-astar 0.4.2 (github:mikewesthad/javascript-astar#c0304b12861eda334e27f2f15d701c10b296593f, MIT)',
    );
  });

  it('missing, it throws and names the file', () => {
    const d = temp();
    expect(() => readVendored(d)).toThrow(join(d, VENDORED));
  });

  it('unreadable or empty, it throws and names the file', () => {
    const d = engineDir();
    writeFileSync(join(d, VENDORED), '[{"name": "navmesh",');
    expect(() => readVendored(d)).toThrow(join(d, VENDORED));
    writeFileSync(join(d, VENDORED), '[]');
    expect(() => readVendored(d)).toThrow(join(d, VENDORED));
  });
});

describe("a build's THIRD_PARTY_NOTICES.txt", () => {
  it("carries navmesh's licence, with javascript-astar's copyright, under a heading that names both", () => {
    const text = vendoredNotices(ROOT).join('\n');
    expect(text).toContain(
      'navmesh 2.3.1 (MIT, carried in the engine; bundles javascript-astar 0.4.2 (github:mikewesthad/javascript-astar#c0304b12861eda334e27f2f15d701c10b296593f, MIT))',
    );
    expect(text).toContain('Copyright (c) 2017 Michael Hadley');
    expect(text).toContain('Copyright (c) Brian Grinstead');
  });

  it('fails without the record, rather than leaving navmesh out', () => {
    const d = temp();
    expect(() => vendoredNotices(d)).toThrow(join(d, VENDORED));
  });

  it('verify:dist finds navmesh named in notices that carry its block, and reports notices without it', () => {
    const notices = ['Third-party software', ...vendoredNotices(ROOT), 'Fonts'].join('\n');
    expect(unnamedVendored(ROOT, notices)).toEqual([]);
    expect(unnamedVendored(ROOT, 'Third-party software\nFonts')).toEqual([
      'licenses/THIRD_PARTY_NOTICES.txt: does not name navmesh 2.3.1, which the engine carries',
    ]);
  });

  it('verify:dist reports the record missing as a problem naming the file, not as nothing to check', () => {
    const d = temp();
    expect(unnamedVendored(d, '')).toEqual([expect.stringContaining(join(d, VENDORED))]);
  });
});

describe("the engine's SBOM", () => {
  it('adds navmesh, by the hash of the file carried, with javascript-astar nested and in the dependency graph', () => {
    const d = engineDir();
    const sbom = withVendored(npmSbom(), d);
    const navmesh = sbom.components.find((c) => c.name === 'navmesh')!;
    expect(navmesh).toMatchObject({
      'bom-ref': 'navmesh@2.3.1',
      type: 'library',
      version: '2.3.1',
      purl: 'pkg:npm/navmesh@2.3.1',
      licenses: [{ license: { id: 'MIT' } }],
      hashes: [
        {
          alg: 'SHA-256',
          content: createHash('sha256')
            .update(readFileSync(join(d, NAVMESH, 'navmesh.js')))
            .digest('hex'),
        },
      ],
    });
    expect(navmesh.components).toEqual([
      expect.objectContaining({
        'bom-ref': 'javascript-astar@0.4.2',
        type: 'library',
        name: 'javascript-astar',
        version: '0.4.2',
        purl: ASTAR_PURL,
        licenses: [{ license: { id: 'MIT' } }],
      }),
    ]);
    // A scanner that reads the flat list sees javascript-astar only nested: it is not a top-level component twice.
    expect(sbom.components.filter((c) => c.name === 'javascript-astar')).toEqual([]);
    expect(sbom.dependencies).toEqual(
      expect.arrayContaining([
        { ref: '@quest-n-click/engine@9.9.9', dependsOn: ['earcut@3.2.4', 'navmesh@2.3.1'] },
        { ref: 'navmesh@2.3.1', dependsOn: ['javascript-astar@0.4.2'] },
        { ref: 'javascript-astar@0.4.2', dependsOn: [] },
      ]),
    );
    // Every reference of the graph is a component's bom-ref, nested ones included (CycloneDX: unique in the BOM).
    const refs = new Set<string>(['@quest-n-click/engine@9.9.9']);
    const walk = (cs: { 'bom-ref'?: string; components?: unknown[] }[] = []) =>
      cs.forEach((c) => (c['bom-ref'] && refs.add(c['bom-ref']), walk(c.components as typeof cs)));
    walk(sbom.components);
    for (const dep of sbom.dependencies) for (const r of [dep.ref, ...dep.dependsOn]) expect(refs, r).toContain(r);
  });

  it('the purls are valid package URLs (type, namespace, name, version)', () => {
    const [v] = readVendored(ROOT);
    for (const p of [v.purl, ...(v.bundled ?? []).map((b) => b.purl)])
      expect(p, p).toMatch(/^pkg:[a-z][a-z0-9.+-]*\/([^/@]+\/)?[^/@]+@[^/@?#]+$/);
  });

  it('fails when the engine archive does not carry the record', () => {
    const d = temp();
    expect(() => withVendored(npmSbom(), d)).toThrow(join(d, VENDORED));
  });
});
