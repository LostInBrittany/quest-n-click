// The readers of the documentation (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.1, phase A4): every program and
// test of the repository that reads the user documentation's files, `docs/en`, `docs/fr`, `docs/img` or `wiki/`, is
// declared here with its migration phase. `A4 active`: it reads the wiki (or the bundle, or runs its tools) and stays
// as it is. `C2 switch`: it reads `docs/` and is repointed by the switch-over pull request (C2), when `docs/en` and
// `docs/fr` become transition pages. A new reader, or one that stopped reading, fails this test until it is declared
// or removed. The patterns find a path written in code beside a file read (comments and imports aside), literal or
// built from a template (`docs/${lang}/…`, `join('docs', lang, …)`): a reader that builds its path some other way is
// caught by review. `docs/dev` stays where it is (D50): its readers are not listed. Two more inventories, both
// repointed at C2: the messages a person reads that cite a `docs/en|fr/…` page (an error, a hint, a usage line, a
// docstring), and the data files that name such a page (`docs/dev/surfaces.json`'s pass surfaces, workflows, templates).
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
  'tools/api-doc.ts': {
    phase: 'C2 switch',
    reads: 'the generated block of docs/en|fr/API.md: generators move to wiki/',
  },
  'tools/dsl-doc.ts': {
    phase: 'C2 switch',
    reads: 'the generated block of docs/en|fr/DSL.md: generators move to wiki/',
  },
  'tools/docs-truth.ts': { phase: 'C2 switch', reads: 'every page of docs/en and docs/fr' },
  'tools/audit-assets.ts': { phase: 'C2 switch', reads: 'the images docs/ shows' },
  'scripts/check-links.mjs': { phase: 'C2 switch', reads: "docs/'s links" },
  'scripts/docs-screenshots.mjs': { phase: 'C2 switch', reads: 'writes docs/img/readme (wiki/images at C2)' },
  // The tests.
  'tests/api-doc.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/API.md' },
  'tests/api-surface.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/API.md' },
  'tests/ci-plan.test.ts': { phase: 'A4 active', reads: 'paths only, for the plan' },
  'tests/dsl-doc.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/DSL.md' },
  'tests/bridge.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/UPGRADING.md' },
  'tests/docs-links.test.ts': { phase: 'C2 switch', reads: 'every page of docs/en and docs/fr' },
  'tests/docs-truth.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr pages' },
  'tests/propagation.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/DSL.md' },
  'tests/scripts-documented.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/TOOLS.md' },
  'tests/support-truth.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr/SUPPORT.md' },
  'tests/wiki-check.test.ts': { phase: 'A4 active', reads: 'the wiki fixtures and the build' },
  'tests/field-carry.test.ts': {
    phase: 'A4 active',
    reads:
      "the docs-beginner-reader pass's binding (wiki/en/** …), digested over a temporary copy, never the wiki itself",
  },
  'tests/wiki-acceptance.test.ts': {
    phase: 'A4 active',
    reads: "wiki/acceptance/questions.json and wiki/'s pages through the loader, and the acceptance fixture",
  },
  'tests/wiki-publish.test.ts': {
    phase: 'A4 active',
    reads: "a copy of the wiki fixture under a test repository's wiki/",
  },
  'tests/contracts.test.ts': {
    phase: 'C2 switch',
    reads: "docs/en|fr/SUPPORT.md, which the status registry's quotes agree with",
  },
  'tests/wiki-coverage.test.ts': { phase: 'C2 switch', reads: 'docs/en|fr, the frozen inventory' },
  'tests/wiki-access.test.ts': { phase: 'C2 switch', reads: "docs/en's eight pages, against the bundle's copies" },
  'tests/mcp-docs.test.ts': { phase: 'C2 switch', reads: "docs/en's eight pages, against read_doc {name}" },
  'tests/wiki-publication.test.ts': {
    phase: 'A4 active',
    reads: 'the wiki fixture, built into archives whose wiki is pushed to throwaway repositories',
  },
  'tests/wiki-transition.test.ts': {
    phase: 'C2 switch',
    reads: "docs/en|fr: a transition page's version against package.json's (none before C2)",
  },
};

const PATH =
  /['"`](?:\.\.?\/)*(?:docs\/(?:en|fr|img|\$\{)|docs['"`](?!\s*,\s*['"`]dev['"`])|wiki\/(?:en|fr|manifest|legacy|coverage|data|images)\b|wiki['"`])/;

/** Programs whose messages or docstrings cite a page of docs/en|fr (C2: repoint the message to its wiki page). */
const MESSAGES = [
  'cli/quest-n-click.mjs',
  'connectors/src/run.ts',
  'scripts/new-game.mjs',
  'scripts/pack.mjs',
  'scripts/release-notes.mjs',
  'src/studio/assistant.ts',
  'src/studio/music.ts',
  'src/studio/remix-tab.ts',
  'tools/api-doc.ts',
  'tools/assets.py',
  'tools/audio.py',
  'tools/audio/mdpipe/sfx.py',
  'tools/check-alpha.py',
  'tools/cut-sheet.py',
  'tools/migrate.ts',
  'tools/pick-bg.py',
  'tools/provenance.ts',
  'tools/release/ship.mjs',
  'tools/validate.ts',
];
/** Data files that name a page of docs/en|fr|img (C2 switch: the surfaces change, ADR 0024; the rest repointed). */
const DATA = [
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/prove.yml',
  'bridge/dev/docker-compose.yml',
  'docs/dev/surfaces.json',
  'games/demo/audio/sfx.json',
  'games/demo/provenance.json',
  'games/reference/provenance.json',
];
const CITE = /docs\/(?:en|fr)\/[A-Za-z_.-]+\.md/;
const COMMENT = /^\s*(\/\/|\*|\/\*|#)/;

const listed = (args: string[]) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...args], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
const textOf = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return undefined; // deleted in the working tree
  }
};
const READ = /\b(readFileSync|readFile|readdirSync|existsSync|createReadStream|statSync|ls-files)\b/;
const SELF = 'tests/docs-consumers.test.ts';

/** The tracked (and new, not ignored) code files that read a documentation path. */
function readers(): Map<string, string[]> {
  const files = listed(['src', 'tools', 'scripts', 'cli', 'studio-server', 'bridge', 'connectors', 'tests']).filter(
    (f) => /\.(ts|mjs|js|cjs|py)$/.test(f) && !f.startsWith('tests/fixtures/') && f !== SELF,
  );
  const out = new Map<string, string[]>();
  for (const f of [...new Set(files)]) {
    const text = textOf(f);
    if (text === undefined || !READ.test(text)) continue;
    const hits = text
      .split('\n')
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(
        ({ l }) => !COMMENT.test(l) && !/^\s*(import\b|\} from )/.test(l) && PATH.test(l.replace(/\s\/\/ .*$/, '')),
      )
      .map(({ l, n }) => `${n}: ${l.trim().slice(0, 80)}`);
    if (hits.length) out.set(f, hits);
  }
  return out;
}

/** The program files (not tests) with a line outside comments that cites a docs/en|fr page. */
function messages(): string[] {
  return [
    ...new Set(
      listed(['src', 'tools', 'scripts', 'cli', 'studio-server', 'bridge', 'connectors', 'games']).filter(
        (f) =>
          /\.(ts|mjs|js|cjs|py|html)$/.test(f) &&
          textOf(f)
            ?.split('\n')
            .some((l) => !COMMENT.test(l) && CITE.test(l)),
      ),
    ),
  ].sort();
}

/** The tracked data files (JSON, YAML) that name a page of docs/en|fr|img, the wiki and the fixtures aside. */
const dataFiles = () =>
  [
    ...new Set(
      listed(['.']).filter(
        (f) =>
          /\.(json|ya?ml)$/.test(f) &&
          !/^(wiki|tests\/fixtures)\//.test(f) &&
          /docs\/(?:en|fr|img)\//.test(textOf(f) ?? ''),
      ),
    ),
  ].sort();

describe('the readers of the documentation (§4.3.1)', () => {
  const found = readers();

  it('declares every reader with its migration phase', () => {
    const undeclared = [...found].filter(([f]) => !CONSUMERS[f]).map(([f, hits]) => `${f} (${hits[0]})`);
    expect(undeclared, 'declare it in CONSUMERS with its phase').toEqual([]);
  });

  it('lists no reader that stopped reading', () => {
    expect(Object.keys(CONSUMERS).filter((f) => !found.has(f))).toEqual([]);
  });

  it('lists the messages that cite a docs/en|fr page (C2: repoint the message)', () => {
    expect(messages()).toEqual([...MESSAGES].sort());
  });

  it('lists the data files that name a docs/ page, surfaces.json among them (C2 switch)', () => {
    expect(dataFiles()).toEqual([...DATA].sort());
  });

  it('reaches docs/en through the loader only, among the MCP and Studio code', () => {
    for (const f of found.keys())
      if (/^(tools\/studio|tools\/mcp|src\/studio|studio-server)\//.test(f))
        expect(CONSUMERS[f]?.phase, f).toBe('A4 active');
  });
});
