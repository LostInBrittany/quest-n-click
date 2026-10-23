// `wiki -- check` and `wiki -- build --target wiki` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 and §4.5.6, phase
// A2) on a small fixture wiki (tests/fixtures/wiki/base: two ready pages, a ready troubleshooting page, a draft, a
// planned page linked from a ready one). Each case copies it and breaks one thing: a planned page with a file, a ready
// page without its twin, a URL off the convention, a ready how-to without questions, a broken anchor, twins whose
// sections differ are errors; a link to a planned page is listed, not an error. The build publishes the ready pages
// only (the drafts too with --preview, under a banner), rewrites the links for the wiki and heads each page with the
// switch to its twin.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildWiki, FOOTER_TEMPLATE } from '../tools/wiki/build';
import { checkWiki, globToRegExp, trackedFiles } from '../tools/wiki/check';
import type { Manifest } from '../tools/wiki/manifest';
import { parsePage, repoPathOf } from '../tools/wiki/page';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** A copy of the fixture wiki, changed by `edit`, and its check report. */
function wiki(edit?: (dir: string, manifest: Manifest) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-check-'));
  temps.push(dir);
  cpSync(BASE, dir, { recursive: true });
  if (edit) {
    const file = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    edit(dir, manifest);
    writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
  return { dir, report: checkWiki({ wikiDir: dir, tracked: TRACKED }) };
}
const page = (m: Manifest, id: string) => m.pages.find((p) => p.id === id)!;
const errorsOf = (edit: (dir: string, manifest: Manifest) => void) => wiki(edit).report.errors;

describe('wiki -- check, the work level', () => {
  it('passes the fixture, listing its link to a planned page without failing on it', () => {
    const { report } = wiki();
    expect(report.errors).toEqual([]);
    expect(report.plannedLinks).toEqual([
      { from: 'create.rooms', lang: 'en', to: 'create.dsl', line: 7 },
      { from: 'create.rooms', lang: 'fr', to: 'create.dsl', line: 7 },
    ]);
    expect(report.gaps).toContain('en/create.rooms.md line 7 links to create.dsl, planned');
  });

  it('refuses a planned page that has a file', () => {
    const errors = errorsOf((dir) => writeFileSync(join(dir, 'en', 'create.dsl.md'), '# DSL\n'));
    expect(errors).toContain('create.dsl (planned): planned, yet en/create.dsl.md exists');
  });

  it('refuses a ready page whose twin is missing', () => {
    const errors = errorsOf((dir) => unlinkSync(join(dir, 'fr', 'create.exits.md')));
    expect(errors).toContain('create.exits (ready): fr/create.exits.md is missing (both languages)');
  });

  it('refuses a file the manifest does not hold', () => {
    const errors = errorsOf((dir) => writeFileSync(join(dir, 'fr', 'stray.md'), '# Égaré\n'));
    expect(errors.some((e) => e.startsWith('fr/stray.md: not a page of the manifest'))).toBe(true);
  });

  it('refuses a URL off the convention', () => {
    const errors = errorsOf((_, m) => {
      page(m, 'create.exits').url.fr = 'FR-Create-Sorties';
    });
    expect(errors.some((e) => e.includes('the fr URL "FR-Create-Sorties" starts with "FR-Creer-"'))).toBe(true);
  });

  it('refuses a ready how-to without a question in each language', () => {
    const errors = errorsOf((_, m) => {
      page(m, 'create.rooms').questions.fr = [];
    });
    expect(errors).toContain('create.rooms (ready): a howto page asks at least one question in fr');
  });

  it('refuses a written page without appliesFrom or sources, and a source glob that matches nothing', () => {
    const errors = errorsOf((_, m) => {
      delete page(m, 'create.exits').versions;
      page(m, 'studio.notes').sources = [];
      page(m, 'create.dsl').sources = ['src/no-such-folder/**'];
    });
    expect(errors).toContain('create.exits (ready): versions.appliesFrom is required once a file exists');
    expect(errors).toContain('studio.notes (draft): sources is required once a file exists');
    expect(errors).toContain('create.dsl: the source "src/no-such-folder/**" matches no tracked file');
  });

  it('warns on a source glob that covers too many files', () => {
    const { report } = wiki((_, m) => {
      page(m, 'create.exits').sources = ['src/**/*.ts'];
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => /the source "src\/\*\*\/\*\.ts" covers \d+ files/.test(w))).toBe(true);
  });

  it('refuses a broken anchor, an unknown page and an anchor not before a heading', () => {
    const errors = errorsOf((dir) => {
      const file = join(dir, 'en', 'create.exits.md');
      writeFileSync(
        file,
        `${readFileSync(file, 'utf8')}\nSee [nothing](create.rooms.md#no-such-section), [a ghost](create.ghost.md) and [here](#nowhere).\n\n<a name="loose"></a>\nNo heading.\n`,
      );
    });
    expect(errors).toContain(
      'en/create.exits.md line 9: create.rooms.md#no-such-section is not a section of en/create.rooms.md',
    );
    expect(errors).toContain('en/create.exits.md line 9: links to create.ghost, which the manifest does not hold');
    expect(errors).toContain('en/create.exits.md line 9: #nowhere is not a section of this page');
    expect(errors).toContain('en/create.exits.md line 11: the anchor "loose" is not followed by a heading');
  });

  it('refuses ready twins whose section ids or link destinations differ', () => {
    const errors = errorsOf((dir) => {
      const file = join(dir, 'fr', 'create.exits.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('name="doors"', 'name="portes"'));
      const rooms = join(dir, 'fr', 'create.rooms.md');
      writeFileSync(rooms, readFileSync(rooms, 'utf8').replace('create.exits.md#doors', 'create.exits.md#portes'));
    });
    expect(errors).toContain(
      'create.exits: the section ids differ between en and fr (only in en: doors; only in fr: portes)',
    );
    expect(errors).toContain(
      'create.rooms: the link destinations differ between en and fr (only in en: create.exits#doors; only in fr: create.exits#portes)',
    );
  });

  it('refuses a link to a repository file git does not track', () => {
    const errors = errorsOf((dir) => {
      const file = join(dir, 'fr', 'create.exits.md');
      writeFileSync(file, `${readFileSync(file, 'utf8')}\nVoir [le code](../../src/engine/core/no-such-file.ts).\n`);
    });
    expect(errors).toContain(
      'fr/create.exits.md line 9: links to src/engine/core/no-such-file.ts, which git does not track',
    );
  });
});

describe('reading a page', () => {
  it('finds section ids, page links, repository links and blocks, and skips fenced code', () => {
    const p = parsePage(readFileSync(join(BASE, 'en', 'create.rooms.md'), 'utf8'));
    expect(p.problems).toEqual([]);
    expect(p.sections).toEqual(['walkable-zones', 'checking']);
    expect(p.links.map((l) => [l.id, l.anchor])).toEqual([
      ['create.exits', 'doors'],
      ['create.dsl', undefined],
      ['studio.notes', undefined],
    ]);
    expect(p.repoLinks.map((l) => l.path)).toEqual(['src/engine/core/save.ts']);
    expect(p.blocks).toEqual([{ kind: 'LIMIT', id: 'no-diagonal', line: 10 }]);
  });

  it('resolves repository paths from the page folder or from the root, never above it', () => {
    expect(repoPathOf('../../src/engine/core/save.ts')).toBe('src/engine/core/save.ts');
    expect(repoPathOf('src/engine/core/save.ts')).toBe('src/engine/core/save.ts');
    expect(repoPathOf('../../../outside.ts')).toBeUndefined();
  });

  it('matches source globs the way the manifest writes them', () => {
    expect(globToRegExp('src/**/*.ts').test('src/engine/core/save.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/engine/core/save.ts')).toBe(false);
    expect(globToRegExp('tools/**').test('tools/wiki/check.ts')).toBe(true);
    expect(globToRegExp('LICENSE*').test('LICENSE-ASSETS')).toBe(true);
    expect(globToRegExp('src/studio/{notes,map-tab}.ts').test('src/studio/map-tab.ts')).toBe(true);
  });
});

describe('wiki -- build --target wiki', () => {
  const build = (preview: boolean) => {
    const out = mkdtempSync(join(tmpdir(), 'wiki-build-'));
    temps.push(out);
    const { report } = wiki();
    const files = buildWiki({
      wikiDir: BASE,
      outDir: out,
      manifest: report.manifest!,
      preview,
      productVersion: '4.5.0',
      docRevision: 'd0c',
      productCommit: 'c0ffee',
    });
    return { out, files, read: (f: string) => readFileSync(join(out, f), 'utf8') };
  };

  it('publishes the ready pages only: no planned nor draft page in the files or the sidebars', () => {
    const { files, read } = build(false);
    expect(files).toContain('en/EN-Create-Rooms.md');
    expect(files).toContain('fr/FR-Equipe-Ecriture-Refusee-423.md');
    expect(files.some((f) => f.includes('Studio-Notes'))).toBe(false);
    expect(files.some((f) => f.includes('Dsl'))).toBe(false);
    for (const lang of ['en', 'fr']) {
      const sidebar = read(`${lang}/_Sidebar.md`);
      expect(sidebar).not.toMatch(/Studio-Notes|Dsl/);
      expect(sidebar).toMatch(lang === 'en' ? /\[Rooms\]\(EN-Create-Rooms\)/ : /\[Salles\]\(FR-Creer-Salles\)/);
    }
    expect(files).toEqual(expect.arrayContaining(['Home.md', '_Footer.md', 'en/_Sidebar.md', 'fr/_Sidebar.md']));
  });

  it('rewrites links: a page to its URL in the same language, the code to the product commit, an unpublished page to text, inline code never', () => {
    const { read } = build(false);
    const en = read('en/EN-Create-Rooms.md');
    expect(en).toContain('[a door](EN-Create-Exits#doors)');
    expect(en).toContain('[save.ts](https://github.com/wanoo/quest-n-click/blob/c0ffee/src/engine/core/save.ts#L1)');
    expect(en).toContain('every command is in the DSL (coming)');
    expect(en).toContain('Leave a note from the Studio (coming)');
    expect(en).toContain('[the zones](#walkable-zones)');
    expect(en).toContain('[not a link](nowhere.md)');
    expect(en).toContain('> **Limit** · `no-diagonal`');
    expect(read('en/EN-Create-Exits.md')).toContain('a link written `[its zone](create.rooms.md#walkable-zones)` in');
    expect(read('fr/FR-Creer-Sorties.md')).toContain('[sa zone](FR-Creer-Salles#walkable-zones)');
  });

  it('heads each page with the switch to its twin, its type, audience, context and versions, and ends with its source', () => {
    const { read } = build(false);
    expect(read('en/EN-Create-Rooms.md')).toContain(
      '# Rooms\n\n> [Français](FR-Creer-Salles) · Type: how-to · Audience: author · Context: created project · Applies from: 4.5.0\n',
    );
    const fr = read('fr/FR-Creer-Salles.md');
    expect(fr).toContain(
      "> [English](EN-Create-Rooms) · Type : procédure · Public : auteur · Contexte : projet créé · S'applique depuis : 4.5.0",
    );
    expect(fr).toContain('(https://github.com/wanoo/quest-n-click/blob/main/wiki/fr/create.rooms.md)');
  });

  it('builds the four indexes from the published pages and the glossary', () => {
    const { read } = build(false);
    expect(read('en/EN-Index-By-Task.md')).toContain('- How do I add a room? → [Rooms](EN-Create-Rooms)');
    expect(read('en/EN-Index-By-Task.md')).not.toContain('note');
    expect(read('fr/FR-Index-Par-Symptome.md')).toContain(
      '- Pourquoi mon enregistrement est refusé avec 423 ? → [Écriture refusée : pan verrouillé (423)](FR-Equipe-Ecriture-Refusee-423)',
    );
    expect(read('en/EN-Index-Identifiers.md')).toContain('- `walkTo` → [Rooms](EN-Create-Rooms)');
    const glossary = read('fr/FR-Index-Glossaire.md');
    expect(glossary).toContain('**bail** (aussi : verrou ; anglais : lease)');
    expect(glossary).toContain('→ [Écriture refusée : pan verrouillé (423)](FR-Equipe-Ecriture-Refusee-423)');
    expect(glossary).not.toContain('Dsl');
  });

  it('includes the drafts under a banner with --preview', () => {
    const { files, read } = build(true);
    expect(files).toContain('fr/FR-Studio-Notes.md');
    expect(read('fr/FR-Studio-Notes.md')).toMatch(/^# Notes\n\n> \*\*Brouillon\*\* :/);
    expect(read('en/_Sidebar.md')).toContain('[Notes](EN-Studio-Notes)');
    expect(read('en/EN-Create-Rooms.md')).toContain('[the Studio](EN-Studio-Notes)');
    expect(read('en/EN-Create-Rooms.md')).not.toContain('**Draft**');
  });

  it('fills the footer from the product version and the doc revision, and says edits are overwritten', () => {
    const { read } = build(false);
    expect(FOOTER_TEMPLATE).toContain('{{productVersion}}');
    const footer = read('_Footer.md');
    expect(footer).toContain("quest'n'click 4.5.0");
    expect(footer).toContain('`d0c`');
    expect(footer).toContain('overwritten at the next publication');
    expect(footer).not.toContain('{{');
    expect(read('Home.md')).toMatch(/\| Français \| English \|/);
  });

  it('refuses to empty a folder that holds something other than a previous build', () => {
    const out = mkdtempSync(join(tmpdir(), 'wiki-build-'));
    temps.push(out);
    writeFileSync(join(out, 'precious.txt'), 'keep me');
    const { report } = wiki();
    expect(() =>
      buildWiki({
        wikiDir: BASE,
        outDir: out,
        manifest: report.manifest!,
        preview: false,
        productVersion: '4.5.0',
        docRevision: 'd0c',
        productCommit: 'c0ffee',
      }),
    ).toThrow(/holds no previous build/);
    expect(existsSync(join(out, 'precious.txt'))).toBe(true);
  });
});
