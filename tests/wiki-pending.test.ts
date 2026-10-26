// Pending acks (4.5.5, #360): while a branch is open, `translations --ack` and `review-claim` write its own
// `changes/<slug>.acks.json` instead of wiki/translations.json and wiki/reviews.json, which only main, master and a
// release branch write. Every conflict on those two files replayed since 4.5.0 was the same section (or claim) recorded
// on both sides; now two branches write two pending files. On a git repository made for the case, two branches ack
// the same section, neighbouring sections and a claim, and merge with no conflict in both directions; every reader sees
// the two files plus the pending ones (the records of the current text win, their reviewers merged); the release's fold
// moves what still holds into the two files, deletes the pending files, and lists what no longer holds, a person's
// review named, never lost silently, never invented.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { reviewClaim } from '../tools/wiki/claims';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import type { Manifest } from '../tools/wiki/manifest';
import { pendingTarget } from '../tools/wiki/pending';
import type { Reviewer } from '../tools/wiki/reviewer';
import { ackTranslation, readTranslations, translationStates } from '../tools/wiki/translations';

const BASE = resolve('tests/fixtures/wiki/base');
const TEST = 'tests/sample.test.ts';
const DATE = '2026-10-26';
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
const ai = (name: string): Reviewer => ({ name, kind: 'ai', relation: 'author', date: DATE });
const person = (name: string): Reviewer => ({ name, kind: 'human', relation: 'independent', date: DATE });

const check = (root: string) => checkWiki({ wikiDir: join(root, 'wiki'), tracked: trackedFiles(root), root });
const claim = (root: string) => check(root).claims.find((c) => c.id === 'zones-hold')!;
const states = (root: string) => {
  const wikiDir = join(root, 'wiki');
  const m = JSON.parse(readFileSync(join(wikiDir, 'manifest.json'), 'utf8')) as Manifest;
  return Object.fromEntries(
    translationStates(wikiDir, m, readTranslations(wikiDir).translations).pairs.map((p) => [
      p.key,
      p.state === 'paired' ? p.reviewers!.map((r) => `${r.name}:${r.kind}`) : p.state,
    ]),
  );
};
const pendingFiles = (root: string) =>
  existsSync(join(root, 'changes'))
    ? readdirSync(join(root, 'changes'))
        .filter((f) => f.endsWith('.acks.json'))
        .sort()
    : [];
/** Every person's review in a text of the records, as written: the fold may keep them, never add one. */
const humansIn = (text: string) =>
  new Set([...text.matchAll(/\{ "name": "([^"]+)", "kind": "human"[^}]*\}/g)].map((m) => m[0]));

/**
 * main, every pair and the claim recorded there (a person on create.exits#doors), then two branches from it:
 *   fix/a-pages: create.exits#doors edited and acked; create.rooms#walkable-zones's first line edited and acked; the
 *                test's line one edited, the claim reviewed;
 *   fix/b-pages: create.rooms#_lead edited and acked, then read by a person; #checking edited and acked;
 *                #walkable-zones's limit line edited and acked; team.write-refused-423#_lead read again (no edit);
 *                the test's line two edited, the claim reviewed.
 */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'wiki-pending-'));
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
  const review = (reviewer: Reviewer) => expect(reviewClaim({ wikiDir, state: claim(root), reviewer })).toBeUndefined();
  for (const p of translationStates(wikiDir, manifest, readTranslations(wikiDir).translations).pairs)
    ack(p.key, ai('claude-base'));
  ack('create.exits#doors', person('wanoo'));
  review(ai('claude-base'));
  commit(root, 'the pairs read');
  const page = (lang: string, id: string) => join(wikiDir, lang, `${id}.md`);

  git(root, 'switch', '-q', '-c', 'fix/a-pages');
  edit(page('en', 'create.exits'), 'leads to another room', 'opens on another room');
  edit(page('fr', 'create.exits'), 'mène à une autre salle', 'ouvre sur une autre salle');
  ack('create.exits#doors', ai('claude-a'));
  edit(page('en', 'create.rooms'), 'The hero walks inside the zones.', 'The hero only walks inside the zones.');
  edit(page('fr', 'create.rooms'), 'Le héros marche dans les zones.', 'Le héros ne marche que dans les zones.');
  ack('create.rooms#walkable-zones', ai('claude-a'));
  edit(join(root, TEST), '// one', '// one, as a reads it');
  review(ai('claude-a'));
  commit(root, 'a');

  git(root, 'switch', '-q', 'main');
  git(root, 'switch', '-q', '-c', 'fix/b-pages');
  edit(page('en', 'create.rooms'), '# Rooms', '# The rooms');
  edit(page('fr', 'create.rooms'), '# Salles', '# Les salles');
  ack('create.rooms#_lead', ai('claude-b'));
  ack('create.rooms#_lead', person('a reader'));
  edit(page('en', 'create.rooms'), 'See [the code]', 'Read [the code]');
  edit(page('fr', 'create.rooms'), 'Voir [le code]', 'Lire [le code]');
  ack('create.rooms#checking', ai('claude-b'));
  edit(page('en', 'create.rooms'), 'a curve is drawn with several points', 'a curve takes several points');
  edit(page('fr', 'create.rooms'), 'une courbe se trace avec plusieurs points', 'une courbe prend plusieurs points');
  ack('create.rooms#walkable-zones', ai('claude-b'));
  ack('team.write-refused-423#_lead', ai('claude-b'));
  edit(join(root, TEST), '// two', '// two, as b reads it');
  review(ai('claude-b'));
  commit(root, 'b');
  git(root, 'switch', '-q', 'main');
  return { root, wikiDir, manifest };
}

describe('pending acks: a branch never writes the two record files (#360)', () => {
  it('writes the branch its own changes/<slug>.acks.json, and leaves the two files as main has them', () => {
    const { root } = repo();
    for (const [branch, file] of [
      ['fix/a-pages', 'a-pages.acks.json'],
      ['fix/b-pages', 'b-pages.acks.json'],
    ] as const) {
      expect(git(root, 'diff', '--name-only', 'main', branch).split('\n')).toEqual(
        expect.arrayContaining([`changes/${file}`]),
      );
      expect(
        git(root, 'diff', '--name-only', 'main', branch, '--', 'wiki/translations.json', 'wiki/reviews.json'),
      ).toBe('');
    }
    git(root, 'switch', '-q', 'fix/b-pages');
    const pending = JSON.parse(readFileSync(join(root, 'changes/b-pages.acks.json'), 'utf8'));
    expect(Object.keys(pending)).toEqual(['format', 'version', 'pairs', 'claims']);
    expect(Object.keys(pending.pairs)).toEqual([
      'create.rooms#_lead',
      'create.rooms#checking',
      'create.rooms#walkable-zones',
      'team.write-refused-423#_lead',
    ]);
    // The same text read again on the branch adds a reviewer; main's record of the same text merges in at reading.
    expect(pending.pairs['create.rooms#_lead'].reviewers.map((r: Reviewer) => r.name)).toEqual([
      'claude-b',
      'a reader',
    ]);
    expect(states(root)['team.write-refused-423#_lead']).toEqual(['claude-base:ai', 'claude-b:ai']);
    expect(states(root)['create.rooms#_lead']).toEqual(['claude-b:ai', 'a reader:human']);
  });

  it('merges the two branches with no conflict in both directions, and the readers see both', () => {
    const { root } = repo();
    const after: Record<string, unknown>[] = [];
    for (const [on, first, second] of [
      ['fix/a-pages', 'fix/b-pages', undefined],
      ['main', 'fix/a-pages', 'fix/b-pages'],
      ['fix/b-pages', 'main', undefined],
    ] as const) {
      git(root, 'switch', '-q', on);
      git(root, 'merge', '-q', '--no-edit', first);
      if (second) git(root, 'merge', '-q', '--no-edit', second);
      expect(git(root, 'status', '--porcelain')).toBe('');
      if (on === 'fix/b-pages') expect(pendingFiles(root)).toEqual(['a-pages.acks.json', 'b-pages.acks.json']);
      const r = check(root);
      expect(r.errors).toEqual([]);
      // The section both edited is a third text: neither pending record holds it.
      expect(r.warnings.filter((w) => /translations|claim/.test(w))).toEqual([
        "create.rooms: the claim zones-hold's review no longer holds: the test file changed since its review",
        'translations: create.rooms#walkable-zones is to review (both sides changed since 2026-10-26): read both sides, then npm run wiki -- translations --ack create.rooms#walkable-zones --by <name> --kind human|ai --relation author|independent',
      ]);
      after.push(states(root));
    }
    expect(after[0]).toMatchObject({
      'create.exits#doors': ['claude-a:ai'],
      'create.rooms#_lead': ['claude-b:ai', 'a reader:human'],
      'create.rooms#checking': ['claude-b:ai'],
      'create.rooms#walkable-zones': 'to review',
      'team.write-refused-423#_lead': ['claude-base:ai', 'claude-b:ai'],
    });
    expect(after[1]).toEqual(after[0]);
    expect(after[2]).toEqual(after[0]);
  });

  it("folds at the release: what holds goes into the two files, the rest is listed, a person's review named", () => {
    const { root, wikiDir, manifest } = repo();
    git(root, 'merge', '-q', '--no-edit', 'fix/a-pages');
    git(root, 'merge', '-q', '--no-edit', 'fix/b-pages');
    const before = humansIn(
      ['wiki/translations.json', 'wiki/reviews.json', 'changes/a-pages.acks.json', 'changes/b-pages.acks.json']
        .map((f) => readFileSync(join(root, f), 'utf8'))
        .join('\n'),
    );
    git(root, 'switch', '-q', '-c', 'release/9.9.9');
    // On a release branch the two files are written directly: the section both edited, read again.
    expect(
      ackTranslation({ wikiDir, manifest, key: 'create.rooms#walkable-zones', reviewer: ai('claude-release') }),
    ).toBeUndefined();
    expect(pendingFiles(root)).toEqual(['a-pages.acks.json', 'b-pages.acks.json']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(main(['acks', '--fold', `--wiki=${wikiDir}`])).toBe(0);
    const said = [...log.mock.calls.flat(), ...warn.mock.calls.flat()].join('\n');
    vi.restoreAllMocks();
    expect(pendingFiles(root)).toEqual([]);
    expect(said).toContain(
      '✔  acks: 2 pending file(s) folded into wiki/translations.json and wiki/reviews.json: 4 pair(s) and 0 claim review(s) kept',
    );
    // What no longer holds its text: listed with its reviewers and the command to record it again.
    expect(said).toContain(
      '⚠  create.rooms#walkable-zones (changes/a-pages.acks.json): the record by claude-a (ai, author, 2026-10-26) no longer holds its text; it is not kept: npm run wiki -- translations --ack create.rooms#walkable-zones --by <name> --kind human|ai --relation author|independent',
    );
    expect(said).toContain(
      "⚠  zones-hold (changes/b-pages.acks.json): the review by claude-b (ai, author, 2026-10-26) no longer holds the claim's text or test; it is not kept: npm run wiki -- review-claim zones-hold --by <name> --kind human|ai --relation author|independent",
    );
    // main's own record replaced by a pending one of a newer text: the person who read the old text is said.
    expect(said).toContain(
      '⚠  create.exits#doors: the review by wanoo (human, independent, 2026-10-26) was of the text before; the pair now holds claude-a (ai, author)',
    );
    const t = JSON.parse(readFileSync(join(wikiDir, 'translations.json'), 'utf8')).pairs;
    expect(t['create.rooms#_lead'].reviewers.map((r: Reviewer) => r.name)).toEqual(['claude-b', 'a reader']);
    expect(t['team.write-refused-423#_lead'].reviewers.map((r: Reviewer) => r.name)).toEqual([
      'claude-base',
      'claude-b',
    ]);
    expect(t['create.rooms#walkable-zones'].reviewers.map((r: Reviewer) => r.name)).toEqual(['claude-release']);
    // No person invented: every person's review the two files hold now was in one of the inputs.
    for (const h of humansIn(readFileSync(join(wikiDir, 'translations.json'), 'utf8')))
      expect(before.has(h)).toBe(true);
    const r = check(root);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => /^translations/.test(w))).toEqual([]);
    // Folding again finds nothing.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['acks', '--fold', `--wiki=${wikiDir}`])).toBe(0);
    vi.restoreAllMocks();
  });

  it('chooses where an ack goes: the branch slug, the two files on main or a release, a detached HEAD refused', () => {
    const { root, wikiDir } = repo();
    const at = (branch: string) => {
      git(root, 'switch', '-q', '-c', branch, 'main');
      return pendingTarget(wikiDir);
    };
    expect(pendingTarget(wikiDir)).toEqual({});
    expect(at('feature/302-ci')).toEqual({ file: join(root, 'changes', '302-ci.acks.json'), slug: '302-ci' });
    expect(at('docs/4.5.5')).toEqual({ file: join(root, 'changes', '4.5.5.acks.json'), slug: '4.5.5' });
    expect(at('release/4.5.5')).toEqual({});
    expect(pendingTarget(wikiDir, 'mine')).toEqual({ file: join(root, 'changes', 'mine.acks.json'), slug: 'mine' });
    git(root, 'switch', '-q', '--detach', 'main');
    expect(pendingTarget(wikiDir).error).toBe(
      'no branch is checked out: name the pending file with --pending <slug> (it writes changes/<slug>.acks.json)',
    );
    expect(pendingTarget(wikiDir, '../x').error).toBe(
      '--pending is a slug (letters, digits, ".", "-", "_"), not "../x"',
    );
  });
});
