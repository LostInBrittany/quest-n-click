// `wiki -- check --publish`, the publication level (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1.4, §4.5.2, §4.5.3
// and §4.7.1, phase A5), on a small git repository made for each case: the fixture wiki under `wiki/`, a test file
// whose test a guarantee names, a package.json at 4.5.0. Published means: the ready pages link to ready pages only;
// no translation pair is to review (`wiki/translations.json`, recorded by `translations --ack`, reset by a change on
// either side: a warning at the work level, an error here); every claim of a ready page was executed on the product
// commit (a Vitest JSON report and its commit.json); the doc revision is the checkout, descends from the product
// commit and changed documentation only since; `--released` refuses what applies only from a later version; and
// `--state preview` is refused once a release v4.5.0 or later is tagged.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { checkWiki, type PublishOptions, trackedFiles } from '../tools/wiki/check';
import type { Manifest } from '../tools/wiki/manifest';
import { ackTranslation, readTranslations, translationStates } from '../tools/wiki/translations';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const TEST = 'tests/sample.test.ts';
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (root: string, message: string) => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
};
const edit = (file: string, from: string, to: string) => {
  const text = readFileSync(file, 'utf8');
  expect(text).toContain(from);
  writeFileSync(file, text.replace(from, to));
};

const GUARANTEE = {
  en: '> [!GUARANTEE id=zones-hold]\n> The hero never leaves a zone.\n',
  fr: "> [!GUARANTEE id=zones-hold]\n> Le héros ne sort jamais d'une zone.\n",
};

/**
 * A repository at a product commit: the fixture wiki, its ready pages linking to ready pages only, a guarantee on
 * create.rooms tied to tests/sample.test.ts; with `paired`, every translation pair recorded (a second commit,
 * documentation only, as a doc fix would be).
 */
function repo(o: { paired?: boolean } = {}) {
  const root = tmp('wiki-publish-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.org');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'tag.gpgsign', 'false');
  const wikiDir = join(root, 'wiki');
  cpSync(BASE, wikiDir, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '4.5.0' }));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, TEST), "describe('zones', () => {\n  it('hold', () => {});\n});\n");
  for (const lang of ['en', 'fr'] as const) {
    const file = join(wikiDir, lang, 'create.rooms.md');
    edit(
      file,
      lang === 'en' ? '[the DSL](create.dsl.md)' : '[le DSL](create.dsl.md)',
      lang === 'en' ? 'the DSL' : 'le DSL',
    );
    edit(
      file,
      lang === 'en' ? '[the Studio](studio.notes.md)' : '[le Studio](studio.notes.md)',
      lang === 'en' ? 'the Studio' : 'le Studio',
    );
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n${GUARANTEE[lang]}`);
  }
  const m = JSON.parse(readFileSync(join(wikiDir, 'manifest.json'), 'utf8')) as Manifest;
  m.pages.find((p) => p.id === 'create.rooms')!.claims = [{ id: 'zones-hold', test: `${TEST} › zones › hold` }];
  writeFileSync(join(wikiDir, 'manifest.json'), JSON.stringify(m, null, 2));
  const product = commit(root, 'the product');
  git(root, 'tag', 'v4.5.0-rc.1');
  if (o.paired) {
    for (const p of translationStates(wikiDir, m, readTranslations(wikiDir).translations).pairs)
      expect(ackTranslation({ wikiDir, manifest: m, key: p.key, by: 'a reader', date: '2026-10-23' })).toBeUndefined();
    commit(root, 'the translations read');
  }
  return { root, wikiDir, product, manifest: m };
}

/** A Vitest JSON report of the sample test, passed, run on `sha`. */
function report(sha: string): string {
  const dir = tmp('wiki-publish-report-');
  writeFileSync(
    join(dir, 'vitest.json'),
    JSON.stringify({
      testResults: [
        { name: `/runner/${TEST}`, assertionResults: [{ ancestorTitles: ['zones'], title: 'hold', status: 'passed' }] },
      ],
    }),
  );
  writeFileSync(
    join(dir, 'commit.json'),
    JSON.stringify({ format: 'quest-n-click-test-report', version: 1, commit: sha }),
  );
  return join(dir, 'vitest.json');
}

const check = (
  r: { root: string; wikiDir: string },
  publish?: Partial<PublishOptions> & { productRef: string },
  testReports: string[] = [],
) =>
  checkWiki({
    wikiDir: r.wikiDir,
    root: r.root,
    tracked: [...TRACKED, TEST],
    identifiers: [],
    testReports,
    ...(publish ? { publish: { released: false, state: 'published', ...publish } } : {}),
  });

describe('wiki -- check --publish', () => {
  it('passes a paired, executed wiki whose doc fix touches documentation only; the draft is left out, said', () => {
    const r = repo({ paired: true });
    const out = check(r, { productRef: r.product, released: true }, [report(r.product)]);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual(['studio.notes (draft): not published; a ready page may not link to it']);
    expect(out.claims[0]!.executedOn).toBe(r.product);
  });

  it('refuses a ready page that links to a draft or a planned page', () => {
    const r = repo({ paired: true });
    writeFileSync(
      join(r.wikiDir, 'en', 'create.exits.md'),
      `${readFileSync(join(r.wikiDir, 'en', 'create.exits.md'), 'utf8')}\nSee [notes](studio.notes.md) and [the DSL](create.dsl.md).\n`,
    );
    commit(r.root, 'links');
    const errors = check(r, { productRef: r.product }, [report(r.product)]).errors;
    expect(errors).toContain(
      'en/create.exits.md line 9: links to studio.notes, draft: a published page links to ready pages only',
    );
    expect(errors).toContain(
      'en/create.exits.md line 9: links to create.dsl, planned: a published page links to ready pages only',
    );
  });

  it('refuses a translation to review, which the work level only warns about; --ack records it again', () => {
    const r = repo({ paired: true });
    edit(join(r.wikiDir, 'fr', 'create.exits.md'), 'mène à une autre salle', 'ouvre sur une autre salle');
    commit(r.root, 'a French edit');
    const work = check(r);
    expect(work.errors).toEqual([]);
    const line =
      'translations: create.exits#doors is to review (the French changed since 2026-10-23): read both sides, then npm run wiki -- translations --ack create.exits#doors --by <name>';
    expect(work.warnings).toContain(line);
    expect(check(r, { productRef: r.product }, [report(r.product)]).errors).toEqual([line]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['translations', '--ack', 'create.exits#doors', '--by', 'a reader', `--wiki=${r.wikiDir}`])).toBe(0);
    vi.restoreAllMocks();
    expect(readTranslations(r.wikiDir).translations.pairs['create.exits#doors']!.by).toBe('a reader');
    commit(r.root, 'read again');
    expect(check(r, { productRef: r.product }, [report(r.product)]).errors).toEqual([]);
  });

  it('records a pair only for a section both languages hold, and says what was never reviewed', () => {
    const r = repo();
    const ack = (key: string) =>
      ackTranslation({ wikiDir: r.wikiDir, manifest: r.manifest, key, by: 'x', date: '2026-10-23' });
    expect(ack('create.rooms#nowhere')).toBe('en/create.rooms.md has no section "nowhere"');
    expect(ack('create.rooms')).toBe(
      '"create.rooms" is not <id>#<section> (_lead for the text before the first section)',
    );
    expect(ack('create.dsl#x')).toBe('create.dsl is not a written page of the manifest');
    expect(ack('create.rooms#_lead')).toBeUndefined();
    const warnings = check(r).warnings;
    expect(warnings).toContain(
      'translations: create.rooms#walkable-zones is to review (never reviewed as a pair): read both sides, then npm run wiki -- translations --ack create.rooms#walkable-zones --by <name>',
    );
    expect(warnings.some((w) => w.startsWith('translations: create.rooms#_lead'))).toBe(false);
  });

  it('refuses a claim not executed on the product commit', () => {
    const r = repo({ paired: true });
    const other = check(r, { productRef: r.product }, [report('3'.repeat(40))]).errors;
    expect(other).toEqual([
      `create.rooms: the claim zones-hold is not executed: the reports name 333333333333, not the documented commit ${r.product.slice(0, 12)}`,
    ]);
    expect(check(r, { productRef: r.product }).errors).toEqual([
      'create.rooms: the claim zones-hold is not executed: no test report given (--test-report)',
    ]);
    // The work level says it, without failing.
    expect(check(r).gaps).toContain(
      'create.rooms: the claim zones-hold is referenced, not executed (no test report given (--test-report))',
    );
  });

  it('refuses a doc revision that changes code, does not descend from the product, or is not the checkout', () => {
    const r = repo({ paired: true });
    writeFileSync(join(r.root, TEST), `${readFileSync(join(r.root, TEST), 'utf8')}// more\n`);
    writeFileSync(join(r.root, 'wiki', 'coverage.json'), '{}\n');
    commit(r.root, 'code and a generator input');
    expect(check(r, { productRef: r.product }, [report(r.product)]).errors).toEqual([
      'the doc revision changes 2 file(s) outside the documentation since the product commit (only wiki/<lang>/*.md, wiki/manifest.json, wiki/translations.json, wiki/reviews.json and wiki/images/** may change): tests/sample.test.ts, wiki/coverage.json',
    ]);
    const later = git(r.root, 'rev-parse', 'HEAD');
    // The product is after the doc revision: the doc does not descend from it.
    git(r.root, 'checkout', '-q', r.product);
    expect(check(r, { productRef: later, docRef: r.product }).errors).toContain(
      `the doc revision ${r.product.slice(0, 12)} does not descend from the product commit ${later.slice(0, 12)}`,
    );
    expect(check(r, { productRef: r.product, docRef: later }, [report(r.product)]).errors).toContain(
      `--doc-ref ${later}: ${later.slice(0, 12)} is not the checkout's HEAD (${r.product.slice(0, 12)}): check it out first`,
    );
    writeFileSync(join(r.wikiDir, 'en', 'create.exits.md'), '# changed\n');
    expect(
      check(r, { productRef: r.product }, [report(r.product)]).errors.some((e) =>
        e.startsWith("the checkout's documentation differs from"),
      ),
    ).toBe(true);
    expect(check(r, { productRef: 'no-such-ref' }).errors).toContain(
      '--product-ref no-such-ref: not a commit of this repository',
    );
  });

  it('with --released, refuses a page or a section that applies only after the product', () => {
    const r = repo({ paired: true });
    const m = JSON.parse(readFileSync(join(r.wikiDir, 'manifest.json'), 'utf8')) as Manifest;
    m.pages.find((p) => p.id === 'create.exits')!.versions = { appliesFrom: '4.5.1' };
    writeFileSync(join(r.wikiDir, 'manifest.json'), JSON.stringify(m, null, 2));
    for (const lang of ['en', 'fr'])
      edit(
        join(r.wikiDir, lang, 'create.rooms.md'),
        '<a name="checking"></a>\n',
        '<a name="checking"></a>\n<!-- applies: 4.6.0.. -->\n',
      );
    const doc = commit(r.root, 'later pages');
    expect(
      check(r, { productRef: r.product, docRef: doc }, [report(r.product)]).errors.filter(
        (e) => !e.startsWith('translations'),
      ),
    ).toEqual([]);
    const released = check(r, { productRef: r.product, released: true }, [report(r.product)]).errors;
    expect(released.filter((e) => !e.startsWith('translations')).sort()).toEqual([
      'create.exits: applies from 4.5.1, after the released product 4.5.0',
      'en/create.rooms.md#checking: applies from 4.6.0, after the released product 4.5.0',
      'fr/create.rooms.md#checking: applies from 4.6.0, after the released product 4.5.0',
    ]);
  });

  it('refuses the bootstrap preview once a release v4.5.0 or later is tagged, not before', () => {
    const r = repo({ paired: true });
    const preview = () => check(r, { productRef: r.product, state: 'preview' }, [report(r.product)]).errors;
    git(r.root, 'tag', 'v4.4.0', r.product);
    expect(preview()).toEqual([]);
    git(r.root, 'tag', 'v4.5.0', r.product);
    expect(preview()).toEqual([
      "--state preview is the bootstrap's one exception (§4.5.3), refused once a release 4.5.0 or later exists: v4.5.0 does",
    ]);
    // A published state is not concerned.
    expect(check(r, { productRef: 'v4.5.0' }, [report(r.product)]).errors).toEqual([]);
  });

  it('needs --product-ref, and says the level it checked', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main(['check', '--publish'])).toBe(2);
    expect(err.mock.calls.flat().join('\n')).toContain('check --publish needs --product-ref <tag|sha>');
    expect(main(['check', '--publish', '--product-ref', 'v4.4.0', '--state', 'draft'])).toBe(2);
    vi.restoreAllMocks();
  });
});
