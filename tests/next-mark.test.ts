// The next release's mark (#443, tools/next-mark.ts): a branch writes `next` where the version will go, the release
// writes the version. Only the exact mark moves: a code span, code outside a comment, a string, a call in a comment and
// every historical version stay as written.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markKind, rekey, rewriteCode, rewriteFile, rewriteManifest, rewriteMarkdown } from '../tools/next-mark';
import { rewriteWithRecords } from '../tools/next-mark-records';
import { claimsOf, claimTextHash, readReviews, writeReviews } from '../tools/wiki/claims';
import { readManifest } from '../tools/wiki/manifest';
import { parsePage } from '../tools/wiki/page';
import { currentPairHashes, readTranslations, translationStates, writeTranslations } from '../tools/wiki/translations';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('the mark in Markdown (fragments, the wiki)', () => {
  it('writes the version in (next) and (next, …), nowhere else', () => {
    expect(
      rewriteMarkdown(
        [
          '- **Images per language (next, #430)**: `i18n.images` (next) does it.',
          'Since 4.6.0 (4.6.0, #12) and (next, `walk`); the next release; (nextish) and f(next).',
          '[link (next)](x.md) and **bold (next)**.',
        ].join('\n'),
        '4.7.1',
      ),
    ).toBe(
      [
        '- **Images per language (4.7.1, #430)**: `i18n.images` (4.7.1) does it.',
        'Since 4.6.0 (4.6.0, #12) and (4.7.1, `walk`); the next release; (nextish) and f(next).',
        '[link (4.7.1)](x.md) and **bold (4.7.1)**.',
      ].join('\n'),
    );
  });
  it('leaves a quoted mark alone: a code span, one wrapped over a line break, a fenced block', () => {
    const quoted = ['A fragment writes `(next, #n)` and ``(next)``.', '```md', '- **X (next, #1)**', '```'].join('\n');
    expect(rewriteMarkdown(quoted, '4.7.1')).toBe(quoted);
    const wrapped = ['- Refused (next, #443): `✖ x.md:3: 4.7.1 is after', '  4.7.0…`. Write `(next, #n)` (next).'];
    expect(rewriteMarkdown(wrapped.join('\n'), '4.7.1')).toBe(
      ['- Refused (4.7.1, #443): `✖ x.md:3: 4.7.1 is after', '  4.7.0…`. Write `(next, #n)` (4.7.1).'].join('\n'),
    );
  });
  it("writes the version in a section's applies marker, its range and its since", () => {
    expect(rewriteMarkdown('<a name="x"></a>\n<!-- applies: next.. since next -->\n', '4.8.0')).toBe(
      '<a name="x"></a>\n<!-- applies: 4.8.0.. since 4.8.0 -->\n',
    );
    expect(rewriteMarkdown('<!-- applies: 4.2.2.. since next -->', '4.8.0')).toBe(
      '<!-- applies: 4.2.2.. since 4.8.0 -->',
    );
    expect(rewriteMarkdown('<!-- applies: 4.2.2..4.4.0 -->', '4.8.0')).toBe('<!-- applies: 4.2.2..4.4.0 -->');
  });
});

describe('the mark in code: comments only', () => {
  it('writes it in // and /* */ comments, a block over several lines included', () => {
    const src = [
      '// Images by language (next, `i18n.images`): when set.',
      'const a = 1; // turnBack (next, #417)',
      '/* Dots (`map.pins`, next) and (next, #428): a token in the middle and',
      '   a glow (next) */',
      '/**',
      ' * Walk on the map (next, #422).',
      ' */',
    ].join('\n');
    expect(rewriteCode(src, '4.7.1')).toBe(
      [
        '// Images by language (4.7.1, `i18n.images`): when set.',
        'const a = 1; // turnBack (4.7.1, #417)',
        '/* Dots (`map.pins`, next) and (4.7.1, #428): a token in the middle and',
        '   a glow (4.7.1) */',
        '/**',
        ' * Walk on the map (4.7.1, #422).',
        ' */',
      ].join('\n'),
    );
  });
  it('never touches code, a string, a URL or a call named in a comment', () => {
    const src = [
      'if (next) {',
      '  this.out.swap(next);',
      "  describe('map pins (next, #428)', () => {});",
      "  const u = 'https://example.org/(next)';",
      '  const s = \'// a comment (next, #1) in a string\', t = "/* nor (next) */", r = `x // (next)`;',
      '} // calls swap(next) once',
      'const b = (next, other) => 0;',
    ].join('\n');
    expect(rewriteCode(src, '4.7.1')).toBe(src);
  });
  it('keeps every historical version: only the word moves', () => {
    const src = '// 4.6.0 (#401), 4.5.4 (4.5.4, #348), next (next, #443)';
    expect(rewriteCode(src, '4.7.1')).toBe('// 4.6.0 (#401), 4.5.4 (4.5.4, #348), next (4.7.1, #443)');
  });
});

describe("the manifest's version fields", () => {
  it('writes the version where a field says next, any other value kept', () => {
    const m =
      '{ "versions": { "appliesFrom": "next", "featureSince": "next" }, "title": "next", "x": { "appliesFrom": "4.5.0" } }';
    expect(rewriteManifest(m, '4.8.0')).toBe(
      '{ "versions": { "appliesFrom": "4.8.0", "featureSince": "4.8.0" }, "title": "next", "x": { "appliesFrom": "4.5.0" } }',
    );
  });
});

describe('which files the rewrite reads', () => {
  it('the wiki pages and manifest, the source and test files; never history, fixtures or generated files', () => {
    expect(markKind('wiki/en/create.rooms.md')).toBe('markdown');
    expect(markKind('wiki/fr/create.rooms.md')).toBe('markdown');
    expect(markKind('wiki/manifest.json')).toBe('manifest');
    expect(markKind('changes/README.md')).toBe('markdown');
    expect(markKind('src/engine/dom/map-view.ts')).toBe('code');
    expect(markKind('src/engine/dom/style.css')).toBe('code');
    expect(markKind('tests/dom/map-walk.test.ts')).toBe('code');
    expect(markKind('studio-server/src/ops/core.ts')).toBe('code');
    for (const no of [
      'CHANGELOG.md',
      'docs/dev/LOG.md',
      'docs/dev/PLAN-4.6.x-RELEASE-IN-THREE-COMMANDS.md',
      'tests/fixtures/release-4.5.3/before/README.md',
      'tests/fixtures/x.ts',
      'README.md',
      'wiki/translations.json',
      'games/demo/assets.gen.json',
      'games/demo/rooms/house.ts',
    ])
      expect(markKind(no), no).toBeUndefined();
  });
});

describe('the records carried over the rewrite', () => {
  it('moves a hash the record held before to its value after; a stale one stays stale', () => {
    const before = new Map([
      ['a#x', 'h1'],
      ['b#y', 'h2'],
    ]);
    const after = new Map([
      ['a#x', 'h1b'],
      ['b#y', 'h2b'],
    ]);
    const field = {
      field: 'enHash' as const,
      before: (k: string) => before.get(k),
      after: (k: string) => after.get(k),
    };
    const out = rekey(
      {
        'a#x': { enHash: 'h1', frHash: 'f' },
        'b#y': { enHash: 'old', frHash: 'f' },
        'c#z': { enHash: 'h9', frHash: 'f' },
      },
      [field],
    );
    expect(out.records).toEqual({
      'a#x': { enHash: 'h1b', frHash: 'f' },
      'b#y': { enHash: 'old', frHash: 'f' },
      'c#z': { enHash: 'h9', frHash: 'f' },
    });
    expect(out.moved).toBe(1);
  });
});

describe('the rewrite on a copy of the wiki: nothing left to review (#443)', () => {
  it('carries a pair and a claim recorded before the rewrite over to the rewritten text; a stale record stays stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'next-mark-'));
    try {
      const wiki = join(root, 'wiki');
      cpSync(resolve('wiki'), wiki, { recursive: true });
      mkdirSync(join(root, 'tests'));
      mkdirSync(join(root, 'changes'));
      cpSync(resolve('tests/boundaries.test.ts'), join(root, 'tests/boundaries.test.ts'));
      // The mark in a claim's block, both languages, and in a comment of its test file.
      const page = (l: string) => join(wiki, l, 'contribute.boundaries.md');
      for (const [l, from] of [
        ['en', 'no Studio.'],
        ['fr', 'ni le Studio.'],
      ] as const)
        writeFileSync(page(l), readFileSync(page(l), 'utf8').replace(from, `${from.slice(0, -1)} (next, #443).`));
      const testFile = join(root, 'tests/boundaries.test.ts');
      writeFileSync(testFile, `// The layers (next, #443).\n${readFileSync(testFile, 'utf8')}`);
      // Every pair and the claim recorded as they are now; one pair stale on purpose.
      const manifest = readManifest(wiki).manifest!;
      const ai = { name: 'claude-opus-5-5', kind: 'ai', relation: 'author', date: '2026-11-05' } as const;
      const human = { name: 'wanoo', kind: 'human', relation: 'independent', date: '2026-11-05' } as const;
      const pairs = Object.fromEntries(
        [...currentPairHashes(wiki, manifest)].map(([k, h]) => [
          k,
          { enHash: h.enHash, frHash: h.frHash, reviewers: [ai] },
        ]),
      );
      const staleKey = Object.keys(pairs).find((k) => k.startsWith('contribute.conventions#'))!;
      pairs[staleKey] = { ...pairs[staleKey]!, enHash: 'f'.repeat(64) };
      writeTranslations(wiki, pairs);
      const blocks = (id: string, l: 'en' | 'fr') =>
        parsePage(readFileSync(join(wiki, l, `${id}.md`), 'utf8'), l).blocks;
      const claim = claimsOf(manifest, (p, l) => blocks(p.id, l)).find((c) => c.claim.id === 'core-imports-no-dom')!;
      const testBefore = readFileSync(testFile, 'utf8');
      writeReviews(wiki, {
        'core-imports-no-dom': {
          claimTextHash: claimTextHash(claim),
          testFileHash: sha(testBefore),
          reviewers: [human],
        },
      });
      const toReview = () =>
        translationStates(wiki, readManifest(wiki).manifest!, readTranslations(wiki).translations).pairs.filter(
          (p) => p.state === 'to review',
        );
      // contribute.conventions is a ready page: its stale pair is the one to review.
      expect(toReview().map((p) => p.key)).toEqual([staleKey]);

      const changed = [
        'wiki/en/contribute.boundaries.md',
        'wiki/fr/contribute.boundaries.md',
        'tests/boundaries.test.ts',
      ].map((path) => {
        const before = readFileSync(join(root, path), 'utf8');
        return { path, before, after: rewriteFile(path.endsWith('.md') ? 'markdown' : 'code', before, '4.7.1') };
      });
      expect(changed.every((c) => c.after !== c.before && c.after.includes('(4.7.1, #443)'))).toBe(true);
      const moved = rewriteWithRecords(root, changed);
      expect(moved).toEqual({ pairs: 2, claims: 2 });
      // The pair of the claim's section is still paired, the stale one still to review.
      expect(toReview().map((p) => p.key)).toEqual([staleKey]);
      expect(readTranslations(wiki).translations.pairs[staleKey]!.enHash).toBe('f'.repeat(64));
      const after = claimsOf(readManifest(wiki).manifest!, (p, l) => blocks(p.id, l)).find(
        (c) => c.claim.id === 'core-imports-no-dom',
      )!;
      expect(readReviews(wiki).reviews.claims['core-imports-no-dom']).toEqual({
        claimTextHash: claimTextHash(after),
        testFileHash: sha(readFileSync(testFile, 'utf8')),
        reviewers: [human],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('the wiki reads the mark before the release writes it (#443)', () => {
  it('an applies marker may say next, for its range and its since', async () => {
    const { appliesMarker } = await import('../tools/wiki/page');
    expect(appliesMarker('<!-- applies: next.. since next -->')).toEqual({ appliesFrom: 'next', featureSince: 'next' });
    expect(appliesMarker('<!-- applies: 4.2.2.. since next -->')).toEqual({
      appliesFrom: '4.2.2',
      featureSince: 'next',
    });
    expect(appliesMarker('<!-- applies: nextish.. -->')).toBeNull();
  });
  it('next comes after every version: a section of the next release is not true of the current one', async () => {
    const { compareVersions } = await import('../tools/wiki/docs');
    expect(compareVersions('next', '99.0.0')).toBe(1);
    expect(compareVersions('4.7.0', 'next')).toBe(-1);
    expect(compareVersions('next', 'next')).toBe(0);
    expect(compareVersions('4.7.0-rc.1', '4.7.0')).toBe(-1);
  });
  it("the manifest's version fields may say next, nothing else", async () => {
    const { ManifestSchema } = await import('../tools/wiki/manifest');
    const manifest = JSON.parse(readFileSync('wiki/manifest.json', 'utf8'));
    const withVersions = (versions: unknown) =>
      ManifestSchema.safeParse({
        ...manifest,
        pages: manifest.pages.map((p: { id: string }) => (p.id === 'contribute.conventions' ? { ...p, versions } : p)),
      }).success;
    expect(withVersions({ appliesFrom: '4.5.0' })).toBe(true);
    expect(withVersions({ appliesFrom: 'next', featureSince: 'next' })).toBe(true);
    expect(withVersions({ appliesFrom: '4.5.0', featureSince: 'next' })).toBe(true);
    expect(withVersions({ appliesFrom: 'soon' })).toBe(false);
  });
});
