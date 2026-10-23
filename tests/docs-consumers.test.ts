// The readers of the documentation (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.1, phase A4): every program and
// test of the repository that reads the user documentation's files, `docs/en`, `docs/fr`, `docs/img` or `wiki/`, is
// declared here with its migration phase. `A4 active`: it reads the wiki (or the bundle, or runs its tools) and stays
// as it is. `C2 switch`: it reads `docs/` and is repointed by the switch-over pull request (C2), when `docs/en` and
// `docs/fr` become transition pages. A new reader, or one that stopped reading, fails this test until it is declared
// or removed. The patterns find a path written in code beside a file read (comments and imports aside): a reader that
// builds its path some other way is caught by review. `docs/dev` stays where it is (D50): its readers are not listed.
// MCP's tools reach the documentation through tools/wiki/docs-load.ts only; the remote MCP and the Studio's pages read
// no file (the Assistant's demo reads the snapshot).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Phase = 'A4 active' | 'C2 switch';
const CONSUMERS: Record<string, { phase: Phase; reads: string }> = {
  // The access contract (A4): MCP's read_doc, search_docs and list_docs, the demo snapshot, the package.
  'tools/wiki/docs-load.ts': {
    phase: 'C2 switch',
    reads: "wiki/ in the repository and a package's docs-bundle/; read_doc {name}'s eight pages in docs/en until C2",
  },
  'tools/wiki/bundle.ts': { phase: 'C2 switch', reads: 'the eight legacy pages of docs/en, copied exactly until C2' },
  'tools/studio/snapshot.ts': { phase: 'A4 active', reads: "wiki/'s manifest, to embed the ready pages" },
  'scripts/pack.mjs': { phase: 'A4 active', reads: 'runs `wiki -- bundle` into the prepared package' },
  // The wiki's own tools (A2, A3).
  'tools/wiki.ts': { phase: 'A4 active', reads: 'wiki/, the source of every output' },
  'tools/wiki/coverage.ts': { phase: 'C2 switch', reads: 'docs/en and docs/fr, the inventory frozen by L2' },
  'tools/ci-plan.ts': { phase: 'A4 active', reads: "wiki/manifest.json, the docs family's pages" },
  // The generators and checks of the old pages.
  'tools/api-doc.ts': { phase: 'C2 switch', reads: 'the generated block of docs/en|fr/API.md' },
  'tools/docs-truth.ts': { phase: 'C2 switch', reads: 'every page of docs/en and docs/fr' },
  'tools/audit-assets.ts': { phase: 'C2 switch', reads: 'the images docs/ shows' },
  'scripts/check-links.mjs': { phase: 'C2 switch', reads: "docs/'s links" },
  'scripts/docs-screenshots.mjs': { phase: 'C2 switch', reads: 'writes docs/img/readme (wiki/images at C2)' },
  // The tests.
  'tests/api-doc.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/API.md' },
  'tests/api-surface.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/API.md' },
  'tests/ci-plan.test.ts': { phase: 'A4 active', reads: 'paths only, for the plan' },
  'tests/docs-links.test.ts': { phase: 'C2 switch', reads: 'every page of docs/en and docs/fr' },
  'tests/docs-truth.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr pages' },
  'tests/propagation.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/DSL.md' },
  'tests/scripts-documented.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/TOOLS.md' },
  'tests/support-truth.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/SUPPORT.md' },
  'tests/wiki-check.test.ts': { phase: 'A4 active', reads: 'the wiki fixtures and the build' },
  'tests/wiki-coverage.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr, the frozen inventory' },
  'tests/wiki-access.test.ts': { phase: 'C2 switch', reads: "docs/en's eight pages, against the bundle's copies" },
  'tests/mcp-docs.test.ts': { phase: 'C2 switch', reads: "docs/en's eight pages, against read_doc {name}" },
};

const PATH =
  /['"`](?:\.\.?\/)*(?:docs\/(?:en|fr|img)\b|docs['"`](?!\s*,\s*['"`]dev['"`])|wiki\/(?:en|fr|manifest|legacy|coverage|data|images)\b|wiki['"`])/;
const READ = /\b(readFileSync|readFile|readdirSync|existsSync|createReadStream|statSync|ls-files)\b/;
const SELF = 'tests/docs-consumers.test.ts';

/** The tracked (and new, not ignored) code files that read a documentation path. */
function readers(): Map<string, string[]> {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'src',
      'tools',
      'scripts',
      'cli',
      'studio-server',
      'bridge',
      'connectors',
      'tests',
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.(ts|mjs|js|cjs|py)$/.test(f) && !f.startsWith('tests/fixtures/') && f !== SELF);
  const out = new Map<string, string[]>();
  for (const f of [...new Set(files)]) {
    let text: string;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    if (!READ.test(text)) continue;
    const hits = text
      .split('\n')
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => !/^\s*(\/\/|\*|\/\*|#|import\b|\} from )/.test(l) && PATH.test(l.replace(/\s\/\/ .*$/, '')))
      .map(({ l, n }) => `${n}: ${l.trim().slice(0, 80)}`);
    if (hits.length) out.set(f, hits);
  }
  return out;
}

describe('the readers of the documentation (§4.3.1)', () => {
  const found = readers();

  it('declares every reader with its migration phase', () => {
    const undeclared = [...found].filter(([f]) => !CONSUMERS[f]).map(([f, hits]) => `${f} (${hits[0]})`);
    expect(undeclared, 'declare it in CONSUMERS with its phase').toEqual([]);
  });

  it('lists no reader that stopped reading', () => {
    expect(Object.keys(CONSUMERS).filter((f) => !found.has(f))).toEqual([]);
  });

  it('reaches docs/en through the loader only, among the MCP and Studio code', () => {
    for (const f of found.keys())
      if (/^(tools\/studio|tools\/mcp|src\/studio|studio-server)\//.test(f))
        expect(CONSUMERS[f]?.phase, f).toBe('A4 active');
  });
});
