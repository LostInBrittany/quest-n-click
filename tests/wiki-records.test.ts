// The wiki's review records, one file per record (4.5.5, #360, tools/wiki/records.ts). Until 4.5.4 every translation
// pair lived in one wiki/translations.json (every claim review in wiki/reviews.json): two pull requests that edited the
// same section and acked it changed the same lines, and git stopped on a conflict (23 hunks since 20 October, all of
// that kind). Now an ack adds a file named by the hashes it records, and never deletes one: on a git repository made
// for the case, two branches ack neighbouring pages, neighbouring sections and the same section twice, and a plain
// `git merge` is clean; the wiki check still passes, says the section both edited is to review, and `records --prune`
// removes what the merge superseded. The single files of 4.5.4 are refused, and `records --migrate` folds them in
// without losing or changing a record, as many times as it is run.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { migrateReviews, pruneReviews, readReviews, reviewClaim } from '../tools/wiki/claims';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import { formatJson } from '../tools/wiki/json';
import type { Manifest } from '../tools/wiki/manifest';
import type { Reviewer } from '../tools/wiki/reviewer';
import {
  ackTranslation,
  judgedPairs,
  migrateTranslations,
  pruneTranslations,
  readTranslations,
  translationStates,
} from '../tools/wiki/translations';

const BASE = resolve('tests/fixtures/wiki/base');
const TEST = 'tests/sample.test.ts';
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (root: string, message: string) => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
};
const edit = (file: string, from: string, to: string) => {
  const text = readFileSync(file, 'utf8');
  expect(text).toContain(from);
  writeFileSync(file, text.replace(from, to));
};
const who = (name: string, date = '2026-10-26'): Reviewer => ({ name, kind: 'ai', relation: 'author', date });

/** A repository holding the fixture wiki, a claim on create.rooms tied to tests/sample.test.ts, every pair acked. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'wiki-records-'));
  temps.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.org');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'commit.gpgsign', 'false');
  const wikiDir = join(root, 'wiki');
  cpSync(BASE, wikiDir, { recursive: true });
  mkdirSync(join(root, 'tests'));
  mkdirSync(join(root, 'src/engine/core'), { recursive: true });
  writeFileSync(join(root, 'src/engine/core/save.ts'), 'export {};\n');
  writeFileSync(join(root, TEST), "describe('zones', () => {\n  it('hold', () => {});\n});\n\n// one\n\n// two\n");
  const guarantee = {
    en: '> [!GUARANTEE id=zones-hold]\n> The hero never leaves a zone.\n',
    fr: "> [!GUARANTEE id=zones-hold]\n> Le héros ne sort jamais d'une zone.\n",
  };
  for (const lang of ['en', 'fr'] as const) {
    const file = join(wikiDir, lang, 'create.rooms.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n${guarantee[lang]}`);
  }
  const manifest = JSON.parse(readFileSync(join(wikiDir, 'manifest.json'), 'utf8')) as Manifest;
  manifest.pages.find((p) => p.id === 'create.rooms')!.claims = [{ id: 'zones-hold', test: `${TEST} › zones › hold` }];
  writeFileSync(join(wikiDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  commit(root, 'the product');
  const ackAll = (name: string) => {
    for (const p of pairsOf(root).filter((x) => x.state === 'to review'))
      expect(ackTranslation({ wikiDir, manifest, key: p.key, reviewer: who(name) })).toBeUndefined();
  };
  ackAll('claude-base');
  expect(reviewClaim({ wikiDir, state: claim(root), reviewer: who('claude-base') })).toBeUndefined();
  commit(root, 'the pairs read');
  return { root, wikiDir, manifest };
}
const check = (root: string) => checkWiki({ wikiDir: join(root, 'wiki'), tracked: trackedFiles(root), root });
const claim = (root: string) => check(root).claims.find((c) => c.id === 'zones-hold')!;
const pairsOf = (root: string) => {
  const wikiDir = join(root, 'wiki');
  const manifest = JSON.parse(readFileSync(join(wikiDir, 'manifest.json'), 'utf8')) as Manifest;
  return translationStates(wikiDir, manifest, readTranslations(wikiDir).translations).pairs;
};
const files = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
        .sort()
    : [];

describe('two pull requests that ack the wiki merge with no conflict (#360)', () => {
  it('merges acks of neighbouring pages, neighbouring sections and the same section twice, cleanly', () => {
    const { root, wikiDir, manifest } = repo();
    const en = (p: string) => join(wikiDir, 'en', `${p}.md`);
    const fr = (p: string) => join(wikiDir, 'fr', `${p}.md`);
    const ack = (key: string, name: string) =>
      expect(ackTranslation({ wikiDir, manifest, key, reviewer: who(name) })).toBeUndefined();
    // Keys in sort order: …, create.exits#doors (a), create.rooms#_lead (b), create.rooms#checking (b),
    // create.rooms#walkable-zones (a and b, different lines of it). Before 4.5.5 the last one conflicted.
    git(root, 'switch', '-q', '-c', 'a');
    edit(en('create.exits'), 'leads to another room', 'opens on another room');
    edit(fr('create.exits'), 'mène à une autre salle', 'ouvre sur une autre salle');
    ack('create.exits#doors', 'claude-a');
    edit(en('create.rooms'), 'The hero walks inside the zones.', 'The hero only walks inside the zones.');
    edit(fr('create.rooms'), 'Le héros marche dans les zones.', 'Le héros ne marche que dans les zones.');
    ack('create.rooms#walkable-zones', 'claude-a');
    edit(join(root, TEST), '// one', '// one, as a reads it');
    expect(reviewClaim({ wikiDir, state: claim(root), reviewer: who('claude-a') })).toBeUndefined();
    commit(root, 'a');
    git(root, 'switch', '-q', 'main');
    git(root, 'switch', '-q', '-c', 'b');
    edit(en('create.rooms'), '# Rooms', '# The rooms');
    edit(fr('create.rooms'), '# Salles', '# Les salles');
    ack('create.rooms#_lead', 'claude-b');
    edit(en('create.rooms'), 'Leave a note from', 'Leave a short note from');
    edit(fr('create.rooms'), 'Laissez une note depuis', 'Laissez une courte note depuis');
    ack('create.rooms#checking', 'claude-b');
    edit(en('create.rooms'), 'a curve is drawn with several points', 'a curve takes several points');
    edit(fr('create.rooms'), 'une courbe se trace avec plusieurs points', 'une courbe prend plusieurs points');
    ack('create.rooms#walkable-zones', 'claude-b');
    edit(join(root, TEST), '// two', '// two, as b reads it');
    expect(reviewClaim({ wikiDir, state: claim(root), reviewer: who('claude-b') })).toBeUndefined();
    commit(root, 'b');

    git(root, 'switch', '-q', 'a');
    // git's default merge, no driver, no option: it would throw on a conflict.
    git(root, 'merge', '-q', '--no-edit', 'b');
    expect(git(root, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(git(root, 'status', '--porcelain')).toBe('');

    // The wiki check passes. What only one side changed is paired; the section both edited is a third text.
    const merged = check(root);
    expect(merged.errors).toEqual([]);
    expect(merged.warnings.filter((w) => /translations|claim/.test(w))).toEqual([
      "create.rooms: the claim zones-hold's review no longer holds: the test file changed since its review",
      'translations: create.rooms#walkable-zones is to review (both sides changed since 2026-10-26): read both sides, then npm run wiki -- translations --ack create.rooms#walkable-zones --by <name> --kind human|ai --relation author|independent',
    ]);
    expect(Object.fromEntries(pairsOf(root).map((p) => [p.key, p.state]))).toEqual({
      'create.rooms#_lead': 'paired',
      'create.rooms#walkable-zones': 'to review',
      'create.rooms#checking': 'paired',
      'create.exits#_lead': 'paired',
      'create.exits#doors': 'paired',
      'team.write-refused-423#_lead': 'paired',
      'team.write-refused-423#symptom': 'paired',
    });
    // The records both merges left beside the current ones are said, not warned about.
    expect(merged.gaps).toContainEqual(
      expect.stringMatching(
        /^translations: 5 record\(s\) superseded or of a section gone \(translations\/create\.exits\/doors\.[0-9a-f.]+\.json, .*npm run wiki -- records --prune removes them/,
      ),
    );
    expect(merged.gaps).toContainEqual(expect.stringMatching(/^reviews: 2 record\(s\) superseded or of a claim gone/));

    // Read again after the merge, then pruned: deletions only, and the wiki is as if one branch had done it all.
    ack('create.rooms#walkable-zones', 'claude-merge');
    expect(reviewClaim({ wikiDir, state: claim(root), reviewer: who('claude-merge') })).toBeUndefined();
    const before = files(join(wikiDir, 'translations')).length;
    const t = pruneTranslations(wikiDir, manifest);
    const c = pruneReviews(wikiDir, check(root).claims);
    expect(t.errors).toEqual([]);
    expect(c.removed).toHaveLength(3);
    expect(files(join(wikiDir, 'translations'))).toHaveLength(before - t.removed.length);
    expect(files(join(wikiDir, 'translations'))).toHaveLength(pairsOf(root).length);
    const clean = check(root);
    expect(clean.errors).toEqual([]);
    expect(clean.warnings.filter((w) => /translations|claim/.test(w))).toEqual([]);
    expect(clean.gaps.filter((g) => /superseded/.test(g))).toEqual([]);
    expect(pairsOf(root).every((p) => p.state === 'paired')).toBe(true);
  });

  it('merges two branches that ack the same section on the same texts by the same reviewer: the same file', () => {
    const { root, wikiDir, manifest } = repo();
    const key = 'create.exits#doors';
    git(root, 'switch', '-q', '-c', 'a');
    edit(join(wikiDir, 'en', 'create.exits.md'), 'leads to', 'opens on');
    expect(ackTranslation({ wikiDir, manifest, key, reviewer: who('claude-x') })).toBeUndefined();
    commit(root, 'a');
    git(root, 'switch', '-q', 'main');
    git(root, 'switch', '-q', '-c', 'b');
    edit(join(wikiDir, 'en', 'create.exits.md'), 'leads to', 'opens on');
    expect(ackTranslation({ wikiDir, manifest, key, reviewer: who('claude-x') })).toBeUndefined();
    commit(root, 'b');
    git(root, 'merge', '-q', '--no-edit', 'a');
    expect(check(root).errors).toEqual([]);
    expect(pairsOf(root).find((p) => p.key === key)?.state).toBe('paired');
  });

  it('never deletes a file on an ack: a deletion beside an addition could be merged as a rename', () => {
    const { root, wikiDir, manifest } = repo();
    edit(join(wikiDir, 'en', 'create.exits.md'), 'leads to', 'opens on');
    expect(ackTranslation({ wikiDir, manifest, key: 'create.exits#doors', reviewer: who('x') })).toBeUndefined();
    edit(join(root, TEST), '// one', '// one more');
    expect(reviewClaim({ wikiDir, state: claim(root), reviewer: who('x') })).toBeUndefined();
    git(root, 'add', '-A');
    const records = git(
      root,
      'diff',
      '--cached',
      '--name-status',
      '--no-renames',
      '--',
      'wiki/translations',
      'wiki/reviews',
    );
    expect(records.split('\n').map((l) => l[0])).toEqual(['A', 'A']);
  });
});

describe('the records on disk', () => {
  it('refuses a name its content does not hold, and a file that is no record', () => {
    const { wikiDir } = repo();
    const dir = join(wikiDir, 'translations', 'create.exits');
    const [file] = readdirSync(dir);
    renameSync(join(dir, file!), join(dir, 'doors.00000000.00000000.json'));
    writeFileSync(join(wikiDir, 'translations', 'notes.txt'), 'x');
    expect(readTranslations(wikiDir).errors).toEqual([
      'translations/create.exits/doors.00000000.00000000.json: its name says 00000000.00000000, its content ' +
        `${file!.split('.').slice(1, 3).join('.')} (renamed by hand?)`,
      "translations/notes.txt: not a record's name (<key>.<8 hex>.<8 hex>.json)",
    ]);
  });

  it('refuses the single files of 4.5.4 and folds them in, losing and changing nothing, as often as it runs', () => {
    const { root, wikiDir, manifest } = repo();
    // The 4.5.4 layout, made from the records the repository holds, and a person's review added on one pair.
    const pairs = Object.fromEntries(
      [...readTranslations(wikiDir).translations.records].map(([k, [s]]) => [k, s!.record]),
    );
    pairs['create.exits#doors']!.reviewers.push({
      name: 'wanoo',
      kind: 'human',
      relation: 'independent',
      date: '2026-10-24',
    });
    const claims = Object.fromEntries([...readReviews(wikiDir).reviews.records].map(([k, [s]]) => [k, s!.record]));
    rmSync(join(wikiDir, 'translations'), { recursive: true });
    rmSync(join(wikiDir, 'reviews'), { recursive: true });
    const legacy = {
      translations: { format: 'quest-n-click-docs-translations', version: 1, pairs },
      reviews: { format: 'quest-n-click-docs-reviews', version: 1, claims },
    };
    writeFileSync(join(wikiDir, 'translations.json'), formatJson(legacy.translations));
    writeFileSync(join(wikiDir, 'reviews.json'), formatJson(legacy.reviews));
    commit(root, 'the 4.5.4 layout');
    const refused = check(root).errors;
    expect(refused).toContain(
      'translations.json: the single file of 4.5.4 is still there; npm run wiki -- records --migrate moves its records into wiki/translations/ (one file per record, so two pull requests no longer conflict on it), then commit both',
    );
    expect(refused.some((e) => e.startsWith('reviews.json: the single file of 4.5.4'))).toBe(true);
    expect(ackTranslation({ wikiDir, manifest, key: 'create.exits#doors', reviewer: who('x') })).toMatch(
      /the single file of 4\.5\.4/,
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['records', '--migrate', `--wiki=${wikiDir}`])).toBe(0);
    expect(log.mock.calls.flat()).toEqual([
      '✔  translations: 7 record(s) written, 0 merged, 0 already there, into wiki/translations/',
      '✔  reviews: 1 record(s) written, 0 merged, 0 already there, into wiki/reviews/',
    ]);
    vi.restoreAllMocks();
    expect(existsSync(join(wikiDir, 'translations.json'))).toBe(false);
    expect(existsSync(join(wikiDir, 'reviews.json'))).toBe(false);
    const read = () => ({
      pairs: Object.fromEntries(
        [...readTranslations(wikiDir).translations.records].map(([k, l]) => [k, l.map((s) => s.record)]),
      ),
      claims: Object.fromEntries(
        [...readReviews(wikiDir).reviews.records].map(([k, l]) => [k, l.map((s) => s.record)]),
      ),
    });
    const expected = {
      pairs: Object.fromEntries(Object.entries(pairs).map(([k, r]) => [k, [r]])),
      claims: Object.fromEntries(Object.entries(claims).map(([k, r]) => [k, [r]])),
    };
    expect(read()).toEqual(expected);
    expect(check(root).errors).toEqual([]);

    // Again, after a merge brought the old file back from main with one more person on a pair and one new pair ack.
    writeFileSync(
      join(wikiDir, 'translations.json'),
      formatJson({
        ...legacy.translations,
        pairs: {
          ...pairs,
          'create.rooms#checking': {
            ...pairs['create.rooms#checking']!,
            reviewers: [
              ...pairs['create.rooms#checking']!.reviewers,
              { name: 'a reader', kind: 'human', relation: 'independent', date: '2026-10-25' },
            ],
          },
        },
      }),
    );
    expect(migrateTranslations(wikiDir).migration).toEqual({ written: 0, merged: 1, unchanged: 6 });
    expect(migrateReviews(wikiDir).migration).toEqual({ written: 0, merged: 0, unchanged: 0 });
    expect(
      judgedPairs(wikiDir, manifest, readTranslations(wikiDir).translations)['create.rooms#checking']!.reviewers.map(
        (r) => r.name,
      ),
    ).toEqual(['claude-base', 'a reader']);
    // A third run, nothing left to fold in: nothing changes.
    const now = read();
    expect(migrateTranslations(wikiDir).migration).toEqual({ written: 0, merged: 0, unchanged: 0 });
    expect(read()).toEqual(now);
  });
});
