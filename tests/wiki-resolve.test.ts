// `wiki -- records --resolve` (4.5.5, #360): a merge that stopped on wiki/translations.json or wiki/reviews.json,
// resolved in one command. Every such conflict replayed since 4.5.0 was the same key recorded on both sides; here a
// git repository reproduces those shapes (a section edited and acked on both sides, neighbouring sections each acked on
// one side, a person's review on main of a section the branch edited, a claim reviewed on both sides after both edited
// its test) and merges in both directions, main into the branch and the branch into main. Both give the same files:
// main's side, the records only the branch changed, the record whose hashes are the current texts', an AI re-ack of
// what both changed and nobody read, the person's lost review printed, never invented; nothing staged.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { reviewClaim } from '../tools/wiki/claims';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import type { Manifest } from '../tools/wiki/manifest';
import { mainSide, resolveRecords } from '../tools/wiki/resolve';
import type { Reviewer } from '../tools/wiki/reviewer';
import { ackTranslation, conflictHint, readTranslations, translationStates } from '../tools/wiki/translations';

const BASE = resolve('tests/fixtures/wiki/base');
const TEST = 'tests/sample.test.ts';
const DATE = '2026-10-26';
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** A git command expected to fail (a merge that stops on a conflict). */
const gitFails = (root: string, ...args: string[]) => expect(() => git(root, ...args)).toThrow();
const commit = (root: string, message: string) => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
};
const edit = (file: string, from: string, to: string) => {
  const text = readFileSync(file, 'utf8');
  expect(text).toContain(from);
  writeFileSync(file, text.replace(from, to));
};
const ai = (name: string): Reviewer => ({ name, kind: 'ai', relation: 'author', date: DATE });
const wanoo: Reviewer = { name: 'wanoo', kind: 'human', relation: 'independent', date: DATE };

const check = (root: string) => checkWiki({ wikiDir: join(root, 'wiki'), tracked: trackedFiles(root), root });
const claim = (root: string) => check(root).claims.find((c) => c.id === 'zones-hold')!;

/**
 * main and a branch `b` from the same commit, every pair and the claim recorded at the base; then each side's work:
 *   main: create.rooms#_lead edited and acked; #checking's first line edited and acked; #walkable-zones read by a
 *         person (no edit); the test's line one edited, the claim reviewed;
 *   b:    create.exits#doors edited and acked; #checking's last line edited and acked; #walkable-zones edited and
 *         acked; the test's line two edited, the claim reviewed.
 */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'wiki-resolve-'));
  temps.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.org');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'commit.gpgsign', 'false');
  const wikiDir = join(root, 'wiki');
  cpSync(BASE, wikiDir, { recursive: true });
  mkdirSync(join(root, 'src/engine/core'), { recursive: true });
  writeFileSync(join(root, 'src/engine/core/save.ts'), 'export {};\n');
  mkdirSync(join(root, 'tests'));
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
  const ack = (key: string, reviewer: Reviewer) =>
    expect(ackTranslation({ wikiDir, manifest, key, reviewer })).toBeUndefined();
  for (const p of translationStates(wikiDir, manifest, readTranslations(wikiDir).translations).pairs)
    ack(p.key, ai('claude-base'));
  expect(reviewClaim({ wikiDir, state: claim(root), reviewer: ai('claude-base') })).toBeUndefined();
  commit(root, 'the pairs read');
  const page = (lang: string, id: string) => join(wikiDir, lang, `${id}.md`);

  git(root, 'switch', '-q', '-c', 'b');
  edit(page('en', 'create.exits'), 'leads to another room', 'opens on another room');
  edit(page('fr', 'create.exits'), 'mène à une autre salle', 'ouvre sur une autre salle');
  ack('create.exits#doors', ai('claude-b'));
  edit(page('en', 'create.rooms'), 'See [the code]', 'Read [the code]');
  edit(page('fr', 'create.rooms'), 'Voir [le code]', 'Lire [le code]');
  ack('create.rooms#checking', ai('claude-b'));
  edit(page('en', 'create.rooms'), 'The hero walks inside the zones.', 'The hero only walks inside the zones.');
  edit(page('fr', 'create.rooms'), 'Le héros marche dans les zones.', 'Le héros ne marche que dans les zones.');
  ack('create.rooms#walkable-zones', ai('claude-b'));
  edit(join(root, TEST), '// two', '// two, as b reads it');
  expect(reviewClaim({ wikiDir, state: claim(root), reviewer: ai('claude-b') })).toBeUndefined();
  commit(root, 'b');

  git(root, 'switch', '-q', 'main');
  edit(page('en', 'create.rooms'), '# Rooms', '# The rooms');
  edit(page('fr', 'create.rooms'), '# Salles', '# Les salles');
  ack('create.rooms#_lead', ai('claude-main'));
  edit(page('en', 'create.rooms'), 'Back to [the zones]', 'Go back to [the zones]');
  edit(page('fr', 'create.rooms'), 'Retour aux [zones]', 'Revenir aux [zones]');
  ack('create.rooms#checking', ai('claude-main'));
  ack('create.rooms#walkable-zones', wanoo);
  edit(join(root, TEST), '// one', '// one, as main reads it');
  expect(reviewClaim({ wikiDir, state: claim(root), reviewer: ai('claude-main') })).toBeUndefined();
  commit(root, 'main');
  return { root, wikiDir };
}

const files = (wikiDir: string) => ({
  translations: JSON.parse(readFileSync(join(wikiDir, 'translations.json'), 'utf8')),
  reviews: JSON.parse(readFileSync(join(wikiDir, 'reviews.json'), 'utf8')),
});
const names = (r: { reviewers: Reviewer[] }) => r.reviewers.map((x) => `${x.name}:${x.kind}`);
/** Every person named in a version of both files: the resolution may keep them, never add one. */
const humansOf = (...texts: string[]) =>
  new Set(texts.flatMap((t) => [...t.matchAll(/\{ "name": "([^"]+)", "kind": "human"[^}]*\}/g)].map((m) => m[0])));

describe('records --resolve: a conflict on the records, resolved the same in both merge directions (#360)', () => {
  it('merges main into the branch and the branch into main to the same files', () => {
    const { root, wikiDir } = repo();
    const results: ReturnType<typeof files>[] = [];
    for (const [on, merging, side] of [
      ['b', 'main', 'theirs'],
      ['main', 'b', 'ours'],
    ] as const) {
      git(root, 'switch', '-q', on);
      gitFails(root, 'merge', '--no-edit', merging);
      // The conflict this resolves, on both files; the pages and the test merged cleanly.
      expect(git(root, 'diff', '--name-only', '--diff-filter=U').split('\n')).toEqual([
        'wiki/reviews.json',
        'wiki/translations.json',
      ]);
      expect(check(root).errors).toEqual(
        expect.arrayContaining([conflictHint('translations.json'), conflictHint('reviews.json')]),
      );
      const sides = [2, 3].flatMap((n) =>
        ['translations', 'reviews'].map((f) => git(root, 'show', `:${n}:wiki/${f}.json`)),
      );
      expect(mainSide(root).side).toBe(side);

      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(main(['records', '--resolve', '--by', 'claude-resolver', `--wiki=${wikiDir}`])).toBe(0);
      const said = [...log.mock.calls.flat(), ...warn.mock.calls.flat()].join('\n');
      vi.restoreAllMocks();
      expect(said).toContain(
        "✔  wiki/translations.json: 1 record(s) only main changed, 1 only the other side changed; 2 both changed: 0 main's and 1 the other's kept (their hashes are the current texts'), 1 recorded again by claude-resolver (ai, author) (create.rooms#checking), 0 dropped (no text holds them)",
      );
      expect(said).toContain(
        "✔  wiki/reviews.json: 0 record(s) only main changed, 0 only the other side changed; 1 both changed: 0 main's and 0 the other's kept (their hashes are the current texts'), 1 recorded again by claude-resolver (ai, author) (zones-hold), 0 dropped (no text holds them)",
      );
      expect(said).toContain(
        `⚠  wiki/translations.json: create.rooms#walkable-zones: the review by wanoo (human, independent, ${DATE}) is lost with the text it read; once a person reads it again: npm run wiki -- translations --ack create.rooms#walkable-zones --by wanoo --kind human --relation independent`,
      );
      expect(said).toContain('→  nothing staged');

      // Nothing staged: git still holds the conflict; the files are clean, valid, and the wiki check passes.
      expect(git(root, 'diff', '--name-only', '--diff-filter=U')).toContain('wiki/translations.json');
      const r = check(root);
      expect(r.errors).toEqual([]);
      expect(r.warnings.filter((w) => /translations|claim/.test(w))).toEqual([]);
      const out = files(wikiDir);
      // No person invented: every human record in the result was on one side.
      const before = humansOf(...sides);
      for (const h of humansOf(JSON.stringify(out.translations, null, 1).replace(/\n\s*/g, ' ')))
        expect(before.has(h)).toBe(true);
      const p = out.translations.pairs;
      expect(names(p['create.exits#doors'])).toEqual(['claude-b:ai']);
      expect(names(p['create.rooms#_lead'])).toEqual(['claude-main:ai']);
      expect(names(p['create.rooms#walkable-zones'])).toEqual(['claude-b:ai']);
      expect(names(p['create.rooms#checking'])).toEqual(['claude-resolver:ai']);
      expect(names(out.reviews.claims['zones-hold'])).toEqual(['claude-resolver:ai']);
      results.push(out);
      git(root, 'merge', '--abort');
    }
    expect(results[1]).toEqual(results[0]);
  });

  it('never rebuilds a side from the markers: a file staged as it was is refused until git checkout -m', () => {
    const { root, wikiDir } = repo();
    git(root, 'switch', '-q', 'b');
    gitFails(root, 'merge', '--no-edit', 'main');
    expect(resolveRecords({ wikiDir, by: 'claude-resolver', date: DATE }).errors).toEqual([]);
    const fromStages = files(wikiDir);
    git(root, 'merge', '--abort');
    gitFails(root, 'merge', '--no-edit', 'main');
    // git merged the branch's new hashes of create.rooms#walkable-zones cleanly and stopped on the reviewers only:
    // a side read from the markers would show wanoo's review on the branch's text.
    git(root, 'add', 'wiki/translations.json', 'wiki/reviews.json');
    expect(resolveRecords({ wikiDir, by: 'claude-resolver', date: DATE }).errors).toEqual([
      'wiki/translations.json holds conflict markers git no longer knows (staged as it was?): git checkout -m -- wiki/translations.json brings the conflict back, then run this again',
      'wiki/reviews.json holds conflict markers git no longer knows (staged as it was?): git checkout -m -- wiki/reviews.json brings the conflict back, then run this again',
    ]);
    git(root, 'checkout', '-m', '--', 'wiki/translations.json', 'wiki/reviews.json');
    expect(resolveRecords({ wikiDir, by: 'claude-resolver', date: DATE }).errors).toEqual([]);
    expect(files(wikiDir)).toEqual(fromStages);
  });

  it('refuses what it cannot decide: no conflict, no merge, a page still in conflict', () => {
    const { root, wikiDir } = repo();
    expect(resolveRecords({ wikiDir, by: 'x', date: DATE }).errors).toEqual([
      'neither wiki/translations.json nor wiki/reviews.json is in conflict: nothing to resolve',
    ]);
    expect(mainSide(root)).toEqual({ why: 'no merge in progress: say which side is main with --main=ours|theirs' });
    expect(mainSide(root, 'mine').why).toBe('--main is ours or theirs, not "mine"');
    // A page both sides edited on the same line: its hashes would be its markers'.
    git(root, 'switch', '-q', 'b');
    edit(join(wikiDir, 'en', 'create.rooms.md'), '# Rooms', '# All the rooms');
    commit(root, 'b retitles');
    gitFails(root, 'merge', '--no-edit', 'main');
    expect(resolveRecords({ wikiDir, by: 'x', date: DATE }).errors).toEqual([
      'resolve these first, then run it again: wiki/en/create.rooms.md (the records hash the merged pages and tests)',
    ]);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main(['records', '--resolve', `--wiki=${wikiDir}`])).toBe(2);
    vi.restoreAllMocks();
    expect(err).toHaveBeenCalled();
  });
});
