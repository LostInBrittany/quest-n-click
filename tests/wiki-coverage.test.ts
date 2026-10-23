// The coverage matrix (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.2, phase A3). On a fixture repository
// (tests/fixtures/wiki/coverage: an English and a French page, a README, a YAML file naming anchors) and the fixture
// wiki of A2: GitHub's anchors (lowercase, punctuation, accents, emoji and backticks, repeated headings `-1`, `-2`), the
// explicit `<a id>` and `<a name>` anchors, no heading read inside a fence, code blocks hashed with their language and
// line, the limit candidates (a review aid), the incoming anchored links that resolve to nothing listed; `--init`
// refusing to replace a matrix; a merge keeping what a person wrote and flagging what changed or left; the matrix out
// of step, a drop without a reason, an unknown destination or a code block in no row refused by the check; the legacy
// order (the old sections' order, each destination once); the two counters. On the repository itself: the freeze —
// `docs/en|fr` cannot change without the matrix being brought back in step — every old `##` of the eight `read_doc`
// pages covered by `wiki/legacy.json`, and every section planned.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ROOT } from '../tools/game';
import { DOCS } from '../tools/studio/tools';
import { main } from '../tools/wiki';
import { trackedFiles } from '../tools/wiki/check';
import {
  type Coverage,
  type CoverageRow,
  checkCoverage,
  counterLines,
  coverageCounters,
  githubSlug,
  headingText,
  incomingLinks,
  initCoverage,
  inventory,
  inventoryOf,
  legacyOf,
  limitCandidates,
  mergeCoverage,
  readCoverage,
  slugger,
  staleRows,
  unresolvedLinks,
  withReplaces,
  writeCoverage,
} from '../tools/wiki/coverage';
import { formatJson } from '../tools/wiki/json';
import { type Manifest, readManifest } from '../tools/wiki/manifest';

const FIXTURE = resolve('tests/fixtures/wiki/coverage');
const BASE_WIKI = resolve('tests/fixtures/wiki/base');
const FIXTURE_TRACKED = ['README.md', 'notes.yml', 'docs/en/GUIDE.md', 'docs/fr/GUIDE.md'];
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** A copy of the fixture repository and of the fixture wiki, the matrix made and every row planned to `create.exits`. */
function setup(plan: (row: CoverageRow) => void = () => {}) {
  const root = tmp('coverage-root-');
  const wikiDir = tmp('coverage-wiki-');
  cpSync(FIXTURE, root, { recursive: true });
  cpSync(BASE_WIKI, wikiDir, { recursive: true });
  const coverage = initCoverage(inventory(root));
  for (const r of coverage.rows) {
    r.destinations = ['create.exits'];
    r.decision = 'keep';
    r.planned = true;
    plan(r);
  }
  const manifest = () => readManifest(wikiDir).manifest!;
  writeCoverage(wikiDir, coverage, manifest());
  const check = () => checkCoverage({ wikiDir, root, manifest: manifest(), tracked: FIXTURE_TRACKED });
  return { root, wikiDir, coverage, manifest, check };
}
const edit = (file: string, from: string, to: string) =>
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));

describe("GitHub's anchors", () => {
  it('lowercases, strips punctuation and emoji, keeps accents, digits, `_` and `-`, turns each space into `-`', () => {
    const slug = (h: string) => githubSlug(headingText(h));
    expect(slug('Insult sword fighting — native (tested)')).toBe('insult-sword-fighting--native-tested');
    expect(slug('39. De la 4.2.5 à la 4.3.0 « Hero Choice »')).toBe('39-de-la-425-à-la-430--hero-choice-');
    expect(slug('Sam & Max — `use` it (tested) 🚀')).toBe('sam--max--use-it-tested-');
    expect(slug('The API (`/__studio/api/*`, JSON, dev server only)')).toBe('the-api-__studioapi-json-dev-server-only');
    expect(slug('`quest-n-click/content`: writing a game')).toBe('quest-n-clickcontent-writing-a-game');
    expect(slug("C'est **gras** et _penché_")).toBe('cest-gras-et-penché');
    expect(slug('[A link](x.md) and ![an image](y.png) &amp; an <em>tag</em>')).toBe('a-link-and-an-image--an-tag');
    expect(slug('Escaped \\* star')).toBe('escaped--star');
  });

  it('gives a repeated heading -1, -2… in document order, never reusing a slug already given', () => {
    const slug = slugger();
    expect(['Setup', 'Setup', 'Setup 1', 'Setup'].map(slug)).toEqual(['setup', 'setup-1', 'setup-1-1', 'setup-2']);
  });

  it('inventories every level, the explicit anchors, and nothing inside a fence', () => {
    const [en, fr] = inventory(FIXTURE);
    expect(en!.file).toBe('docs/en/GUIDE.md');
    expect(en!.sections.map((s) => [s.level, s.anchor])).toEqual([
      [1, 'the-guide'],
      [2, 'setup'],
      [2, 'setup-1'],
      [2, 'sam--max--use-it-tested-'],
      [2, 'limits'],
    ]);
    expect(en!.anchors).toContain('custom-anchor');
    expect(fr!.anchors).toContain('ancre-perso');
    expect(en!.sections[2]!.anchors).toEqual(['custom-anchor']);
    const levels = inventoryOf(
      'x.md',
      '#### Four\n\n```\n# no\n```\n\n````md\n```\n## still no\n```\n````\n###### Six\n',
    ).sections;
    expect(levels.map((s) => [s.level, s.anchor])).toEqual([
      [4, 'four'],
      [6, 'six'],
    ]);
  });

  it('hashes each code block with its language and line, and keeps a preamble before the first heading', () => {
    const files = inventory(FIXTURE);
    const sam = files[0]!.sections[3]!;
    expect(sam.codeBlocks.map((b) => [b.lang, b.line])).toEqual([
      ['sh', 17],
      ['markdown', 24],
    ]);
    expect(sam.codeBlocks[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    // A different content, a different hash.
    expect(files[1]!.sections[3]!.codeBlocks[1]!.hash).not.toBe(sam.codeBlocks[1]!.hash);
    const readme = files.find((f) => f.file === 'README.md')!;
    expect(readme.sections[0]).toMatchObject({ key: 'README.md', level: 0, anchor: '', lines: [1, 1] });
  });

  it('masks the figures quality:baseline writes, so adding a test moves no frozen section', () => {
    const page = (n: number) => `## In numbers\n\n<!-- metric:tests -->${n}<!-- /metric --> tests, not more.\n`;
    const [a, b] = [inventoryOf('README.md', page(2994)), inventoryOf('README.md', page(3018))];
    expect(a.sections[0]!.hash).toBe(b.sections[0]!.hash);
    expect(a.sections[0]!.limits).toEqual(b.sections[0]!.limits);
  });

  it('proposes the sentences that look like a limit, outside inline code, in both languages', () => {
    expect(limitCandidates('Run the tool. It only works on the local Studio.')).toEqual([
      'It only works on the local Studio.',
    ]);
    expect(limitCandidates('The `not` inside code is no marker. This sentence is plain.')).toEqual([]);
    expect(limitCandidates("Ce n'est pas encore fini. Il ne marche que sur le Studio local. Voilà.")).toEqual([
      "Ce n'est pas encore fini.",
      'Il ne marche que sur le Studio local.',
    ]);
    expect(limitCandidates("It doesn't work offline. Attention : jamais en production.")).toHaveLength(2);
    const [en] = inventory(FIXTURE);
    expect(en!.sections[4]!.limits).toEqual(['You cannot undo a deploy.']);
  });
});

describe('the incoming anchored links (the cross-check)', () => {
  it('reads Markdown links relative to their file, paths in other files from the root, and lists the broken ones', () => {
    const files = inventory(FIXTURE);
    const links = incomingLinks(FIXTURE, FIXTURE_TRACKED, new Set(files.map((f) => f.file)));
    expect(links.map((l) => `${l.from}:${l.line} ${l.target}#${l.anchor}`)).toEqual([
      'README.md:5 docs/en/GUIDE.md#setup-1',
      'README.md:5 docs/en/GUIDE.md#limits',
      'README.md:6 docs/en/GUIDE.md#gone-section',
      'README.md:6 docs/fr/GUIDE.md#installation-1',
      'notes.yml:1 docs/en/GUIDE.md#custom-anchor',
      'notes.yml:1 docs/en/GUIDE.md#nowhere',
      'notes.yml:2 docs/fr/GUIDE.md#sam--max--use-testé-',
      'docs/en/GUIDE.md:31 docs/en/GUIDE.md#setup',
      'docs/en/GUIDE.md:31 docs/en/GUIDE.md#setup-1',
    ]);
    expect(unresolvedLinks(files, links).map((l) => l.anchor)).toEqual(['gone-section', 'nowhere']);
  });

  it('lists them as warnings of the check, never as errors', () => {
    const { check } = setup();
    const report = check();
    expect(report.errors).toEqual([]);
    expect(report.unresolved.map((l) => l.anchor)).toEqual(['gone-section', 'nowhere']);
    expect(report.warnings.join('\n')).toContain('README.md line 6: links to docs/en/GUIDE.md#gone-section');
  });
});

describe('the matrix', () => {
  it('passes the check once every row is planned, and fills the manifest replaces and legacy.json from it', () => {
    const { check, manifest, wikiDir } = setup();
    expect(check().errors).toEqual([]);
    expect(manifest().pages.find((p) => p.id === 'create.exits')!.replaces).toContain(
      'docs/fr/GUIDE.md#installation-1',
    );
    expect(readFileSync(join(wikiDir, 'legacy.json'), 'utf8')).toContain('"format": "quest-n-click-docs-legacy"');
  });

  it('lists a row without a decision as a gap, and refuses a drop without a reason', () => {
    const { check, wikiDir } = setup((r) => {
      if (r.anchor === 'limits') Object.assign(r, { decision: null, planned: false, destinations: [] });
      if (r.anchor === 'setup') Object.assign(r, { decision: 'drop', destinations: [] });
    });
    const report = check();
    expect(report.gaps.join('\n')).toMatch(/section\(s\) of the old documentation have no decision yet: .*#limits/);
    expect(report.errors).toContain('coverage.json docs/en/GUIDE.md#setup: a drop says why (reason)');
    const matrix = readCoverage(wikiDir).coverage!;
    expect(legacyOf(matrix).pages.TOOLS).toEqual([]);
  });

  it('refuses an unknown destination, a missing section of a written page, and a planned row going nowhere', () => {
    const { check } = setup((r) => {
      if (r.anchor === 'setup') r.destinations = ['create.nowhere'];
      if (r.anchor === 'setup-1') r.destinations = ['create.rooms#no-such-section'];
      if (r.anchor === 'limits') r.destinations = [];
    });
    const errors = check().errors;
    expect(errors).toContain(
      'coverage.json docs/en/GUIDE.md#setup: the destination create.nowhere is not a manifest page',
    );
    expect(errors).toContain(
      'coverage.json docs/en/GUIDE.md#setup-1: create.rooms#no-such-section is not a section of create.rooms',
    );
    expect(errors).toContain('coverage.json docs/en/GUIDE.md#limits: planned to keep, yet no destination');
  });

  it('refuses a code block that no row holds', () => {
    const { check, wikiDir } = setup();
    const file = join(wikiDir, 'coverage.json');
    const c = JSON.parse(readFileSync(file, 'utf8')) as Coverage;
    c.rows.find((r) => r.codeBlocks.length)!.codeBlocks = [];
    writeFileSync(file, formatJson(c));
    expect(check().errors).toContain('coverage.json: the code block of docs/en/GUIDE.md line 17 is in no row');
  });

  it('is the freeze: a page changed behind the matrix makes the check fail, naming the command', () => {
    const { check, root } = setup();
    edit(join(root, 'docs/fr/GUIDE.md'), 'Ce n', 'Ce texte n');
    const errors = check().errors;
    expect(errors).toContain(
      'coverage.json is out of step with the pages: docs/fr/GUIDE.md#sam--max--use-testé-: its text changed',
    );
    expect(errors.at(-1)).toMatch(/run `npm run wiki -- coverage`/);
  });

  it('refuses a legacy.json or manifest replaces the matrix does not make', () => {
    const { check, wikiDir } = setup();
    writeFileSync(join(wikiDir, 'legacy.json'), '{}\n');
    const file = join(wikiDir, 'manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    m.pages.find((p) => p.id === 'create.rooms')!.replaces = ['docs/en/GUIDE.md#setup'];
    writeFileSync(file, JSON.stringify(m, null, 2));
    const errors = check().errors;
    expect(errors).toContain('legacy.json is not the one the matrix makes: run `npm run wiki -- coverage`');
    expect(errors.some((e) => e.startsWith('manifest.json: the replaces of create.rooms are not'))).toBe(true);
  });
});

describe('a merge (`wiki -- coverage`)', () => {
  it('keeps what a person wrote, adds a new section, flags a changed one and keeps a vanished one, flagged', () => {
    const { root, coverage } = setup((r) => {
      if (r.anchor === 'limits') {
        r.reason = 'a person wrote this';
        r.migrated = true;
        r.limits[0]!.status = 'reported';
      }
      if (r.anchor === 'setup') r.verification = 'docs-truth';
    });
    edit(
      join(root, 'docs/en/GUIDE.md'),
      '- You cannot undo a deploy.',
      '- You cannot undo a deploy.\n- Never twice.\n\n## A new section\n\nText.\n',
    );
    edit(join(root, 'docs/en/GUIDE.md'), '## Setup\n\nRun', '## Install\n\nRun');
    const files = inventory(root);
    expect(staleRows(coverage, files).length).toBeGreaterThan(0);
    const merged = mergeCoverage(coverage, files);
    expect(merged.added).toEqual(['docs/en/GUIDE.md#install', 'docs/en/GUIDE.md#a-new-section']);
    expect(merged.changed).toEqual(['docs/en/GUIDE.md#setup', 'docs/en/GUIDE.md#limits']);
    // `Setup` became `Install`: the second `Setup` is now the first, so `setup-1` left and `setup` changed.
    expect(merged.removed).toEqual(['docs/en/GUIDE.md#setup-1']);
    const row = (key: string) => merged.coverage.rows.find((r) => r.key === key)!;
    expect(row('docs/en/GUIDE.md#limits')).toMatchObject({
      reason: 'a person wrote this',
      migrated: false,
      flag: 'changed',
      limits: [
        { text: 'You cannot undo a deploy.', status: 'reported' },
        { text: 'Never twice.', status: 'pending' },
      ],
    });
    expect(row('docs/en/GUIDE.md#a-new-section')).toMatchObject({ flag: 'added', decision: null, planned: false });
    expect(row('docs/en/GUIDE.md#setup-1')).toMatchObject({ flag: 'removed', decision: 'keep' });
    expect(merged.coverage.rows.at(-1)!.key).toBe('docs/en/GUIDE.md#setup-1');
    expect(staleRows(merged.coverage, files)).toEqual([]);
  });

  it('`--init` refuses to replace a matrix without --force; `coverage` merges and is stable when run twice', () => {
    const { root, wikiDir } = setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(main(['coverage', '--init', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toContain('--init --force replaces it');
      const before = readFileSync(join(wikiDir, 'coverage.json'), 'utf8');
      expect(main(['coverage', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(0);
      expect(readFileSync(join(wikiDir, 'coverage.json'), 'utf8')).toBe(before);
      expect(log.mock.calls.flat().join('\n')).toContain('destinations planned: sections 100% (12/12)');
      expect(main(['coverage', '--init', '--force', `--wiki=${wikiDir}`, `--root=${root}`])).toBe(0);
      expect(readCoverage(wikiDir).coverage!.rows.every((r) => !r.planned)).toBe(true);
    } finally {
      log.mockRestore();
      err.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('the legacy order and the counters', () => {
  const row = (anchor: string, destinations: string[], extra: Partial<CoverageRow> = {}): CoverageRow => ({
    key: `docs/en/TOOLS.md#${anchor}`,
    file: 'docs/en/TOOLS.md',
    heading: anchor,
    level: 2,
    anchor,
    lines: [1, 1],
    hash: '0'.repeat(64),
    codeBlocks: [],
    anchors: [],
    destinations,
    decision: 'keep',
    reason: null,
    examples: [],
    verification: null,
    planned: true,
    migrated: false,
    limits: [],
    ...extra,
  });

  it("follows the old page's sections, each destination once at its first place, drops and vanished rows left out", () => {
    const coverage: Coverage = {
      format: 'quest-n-click-docs-coverage',
      version: 1,
      rows: [
        row('a', ['reference.npm-scripts#overview', 'create.checking']),
        row('b', ['create.working-loop#playing', 'reference.npm-scripts#overview']),
        row('c', [], { decision: 'drop', reason: 'history' }),
        row('d', ['create.checking', 'create.images']),
        row('e', ['studio.map'], { flag: 'removed' }),
      ],
    };
    expect(legacyOf(coverage).pages.TOOLS).toEqual([
      'reference.npm-scripts#overview',
      'create.checking',
      'create.working-loop#playing',
      'create.images',
    ]);
    expect(Object.keys(legacyOf(coverage).pages)).toEqual([...DOCS]);
  });

  it('counts sections, code blocks and limit candidates, planned and migrated, a limit only once ticked', () => {
    const block = { hash: '1'.repeat(64), lang: 'sh', line: 1 };
    const coverage: Coverage = {
      format: 'quest-n-click-docs-coverage',
      version: 1,
      rows: [
        row('a', ['create.checking'], {
          migrated: true,
          codeBlocks: [block],
          limits: [
            { text: 'Only here.', status: 'reported' },
            { text: 'Not there.', status: 'pending' },
          ],
        }),
        row('b', ['create.checking'], { codeBlocks: [block, block] }),
        row('c', [], { planned: false, decision: null, limits: [{ text: 'Never.', status: 'pending' }] }),
        row('d', ['create.checking'], { flag: 'removed' }),
      ],
    };
    expect(coverageCounters(coverage)).toEqual({
      sections: { total: 3, planned: 2, migrated: 1 },
      codeBlocks: { total: 3, planned: 3, migrated: 1 },
      limits: { total: 3, planned: 2, migrated: 1 },
    });
    expect(counterLines(coverageCounters(coverage))).toEqual([
      'destinations planned: sections 66.6% (2/3) · code blocks 100% (3/3) · limit candidates 66.6% (2/3)',
      'migrated and reviewed: sections 33.3% (1/3) · code blocks 33.3% (1/3) · limit candidates 33.3% (1/3)',
    ]);
  });
});

describe("the repository's matrix", () => {
  const read = readCoverage(resolve('wiki'));
  const coverage = read.coverage!;
  const files = inventory(ROOT);

  it('is valid', () => {
    expect(read.errors).toEqual([]);
  });

  it('is in step with docs/en and docs/fr: the freeze', () => {
    const stale = staleRows(coverage, files);
    expect(
      stale,
      `docs/ is frozen (docs/dev/PLAN-4.5-WIKI.md §4.2): re-run \`npm run wiki -- coverage\` and report the change into the wiki/ pages per the plan.\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('inventories the 32 pages of each language, the root pages, and passes its check', () => {
    expect(files.filter((f) => f.file.startsWith('docs/en/'))).toHaveLength(32);
    expect(files.filter((f) => f.file.startsWith('docs/fr/'))).toHaveLength(32);
    expect(files.map((f) => f.file)).toContain('docs/fr/PRODUCTION.template.md');
    const report = checkCoverage({
      wikiDir: resolve('wiki'),
      root: ROOT,
      manifest: readManifest(resolve('wiki')).manifest!,
      tracked: trackedFiles(),
    });
    expect(report.errors).toEqual([]);
  });

  it('plans a destination or a written drop for every section', () => {
    expect(coverage.rows.filter((r) => !r.planned || !r.decision).map((r) => r.key)).toEqual([]);
    expect(coverage.rows.filter((r) => r.decision === 'drop' && !r.reason).map((r) => r.key)).toEqual([]);
  });

  it('covers every old `##` of the eight read_doc pages in wiki/legacy.json', () => {
    const legacy = JSON.parse(readFileSync(resolve('wiki/legacy.json'), 'utf8')) as { pages: Record<string, string[]> };
    expect(legacy).toEqual(legacyOf(coverage));
    for (const name of DOCS) {
      const rows = coverage.rows.filter((r) => r.file === `docs/en/${name}.md` && r.level === 2);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.destinations.length, r.key).toBeGreaterThan(0);
        for (const d of r.destinations) expect(legacy.pages[name], r.key).toContain(d);
      }
    }
  });

  it('resolves the anchored links the READMEs give into docs/', () => {
    const links = incomingLinks(ROOT, ['README.md', 'README.fr.md'], new Set(files.map((f) => f.file)));
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(unresolvedLinks(files, links)).toEqual([]);
  });

  it('sets the manifest replaces in place, byte for byte, when nothing changed', () => {
    const text = readFileSync(resolve('wiki/manifest.json'), 'utf8');
    const manifest = JSON.parse(text) as Manifest;
    expect(withReplaces(text, new Map(manifest.pages.map((p) => [p.id, p.replaces])))).toBe(text);
    expect(readFileSync(resolve('wiki/coverage.json'), 'utf8')).toBe(formatJson(coverage));
  });
});
