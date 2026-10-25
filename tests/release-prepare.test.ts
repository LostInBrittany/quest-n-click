// `npm run release -- prepare <version>` (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md): the helpers that
// write a release's files, each checked against what the 4.5.3 release commit (2afb9f51) wrote by hand, from the files
// as they were before it (its parent). Prose is never invented: a helper leaves `TODO(release)` where it is needed.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  changelogIntro,
  currentReleaseLine,
  logReleaseEntry,
  nextVersionProblem,
  passesSheet,
  releaseHeading,
  todoMarkers,
  upgradeNotesLead,
  upgradeNotesPage,
  upgradeNotesSection,
  withCurrentRelease,
  withPassIssues,
} from '../tools/release/prepare';

const RELEASE = '2afb9f51';
const at = (ref: string, file: string) => execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
const before = (file: string) => at(`${RELEASE}^`, file);
const after = (file: string) => at(RELEASE, file);
const firstSentence = (page: string) =>
  page
    .split('\n\n')[1]!
    .replace(/\s+/g, ' ')
    .replace(/\. .*$/, '.');

describe('the version a release prepares', () => {
  it('is x.y.z and greater than package.json’s', () => {
    expect(nextVersionProblem('4.5.3', '4.5.4')).toBeUndefined();
    expect(nextVersionProblem('4.5.3', '4.6.0')).toBeUndefined();
    expect(nextVersionProblem('4.5.3', '4.5.3')).toMatch(/not greater than 4\.5\.3/);
    expect(nextVersionProblem('4.5.3', '4.5.2')).toMatch(/not greater/);
    expect(nextVersionProblem('4.5.3', '4.5.4-rc.1')).toMatch(/x\.y\.z/);
    expect(nextVersionProblem('4.5.3', 'v4.5.4')).toMatch(/x\.y\.z/);
  });
  it('names its upgrade-notes page by its minor', () => {
    expect(upgradeNotesPage('4.5.4')).toBe('install.upgrade-notes-4-5');
    expect(upgradeNotesPage('4.10.0')).toBe('install.upgrade-notes-4-10');
  });
});

describe('the CHANGELOG and the LOG', () => {
  it('heads the section as 4.5.3’s', () => {
    expect(releaseHeading('4.5.3', '2026-10-25')).toBe(after('CHANGELOG.md').split('\n')[2]);
  });
  it('opens the section with the LOG range, the name and the previous version, the rest to write', () => {
    const intro = changelogIntro({ version: '4.5.3', name: 'One pass', previous: '4.5.2', first: 300, last: 308 });
    expect(after('CHANGELOG.md').split('\n')[4]).toMatch(/^LOG #300–#308: "One pass", a patch on 4\.5\.2 /);
    expect(intro.startsWith('LOG #300–#308: "One pass", a patch on 4.5.2')).toBe(true);
    expect(intro).toContain('TODO(release)');
  });
  it('writes the release entry of the LOG with 4.5.3’s heading and bullets, each to fill', () => {
    const entry = logReleaseEntry({ n: 308, date: '2026-10-25', version: '4.5.3', name: 'One pass' });
    const real = after('docs/dev/LOG.md')
      .split('\n')
      .find((l) => l.startsWith('## #308 '))!;
    expect(real.startsWith(entry.split('\n')[0]!.replace(/TODO\(release\)$/, ''))).toBe(true);
    for (const b of ['The request', 'What ships', 'Fragments', 'Upgrade notes', 'Reviews', 'Fixtures', 'Passes'])
      expect(entry).toContain(`- **${b}**: TODO(release)`);
    expect(entry.trimEnd().split('\n').pop()).toBe('→ next: TODO(release)');
  });
});

describe('the upgrade notes', () => {
  for (const lang of ['en', 'fr'] as const) {
    const page = `wiki/${lang}/install.upgrade-notes-4-5.md`;
    it(`${lang}: adds the version to the lead's list as 4.5.3 did`, () => {
      expect(firstSentence(upgradeNotesLead(before(page), '4.5.2', '4.5.3', lang))).toBe(firstSentence(after(page)));
    });
    it(`${lang}: opens the section with 4.5.3's anchor, scope and heading; the text to write, the bullets as a start`, () => {
      const section = upgradeNotesSection({
        previous: '4.5.2',
        version: '4.5.3',
        name: 'One pass',
        lang,
        bullets: ['- **A bullet** (4.5.3).'],
      });
      const head = section.split('\n').slice(0, 4).join('\n');
      expect(after(page)).toContain(head);
      expect(section).toContain('TODO(release)');
      expect(section).toContain('- **A bullet** (4.5.3).');
    });
  }
});

describe('the passes', () => {
  it('copies the previous sheet: 4.5.3’s heading and field:init line, the same table, the intro to write', () => {
    const sheet = passesSheet(before('docs/dev/passes/4.5.2.md'), '4.5.2', '4.5.3');
    const real = after('docs/dev/passes/4.5.3.md');
    expect(sheet.split('\n')[0]).toBe('# Passes, 4.5.3');
    const table = (s: string) => s.slice(s.indexOf('<!-- field:begin -->'));
    expect(table(sheet)).toBe(table(real));
    const init = (s: string) => s.split('\n').find((l) => l.startsWith('`npm run field:init'));
    expect(init(sheet)).toBe(init(real));
    expect(sheet).toContain('TODO(release)');
  });
  it("gives every pass of the previous version the same issue for the new one, as contracts.json's 4.5.3 says", () => {
    const prev = JSON.parse(before('docs/dev/contracts.json'));
    const real = JSON.parse(after('docs/dev/contracts.json'));
    expect(withPassIssues(prev, '4.5.2', '4.5.3').passIssues).toEqual(real.passIssues);
  });
});

describe('the README', () => {
  for (const [lang, file] of [
    ['en', 'README.md'],
    ['fr', 'README.fr.md'],
  ] as const) {
    it(`${lang}: names the release as 4.5.3's line does, its summary to write`, () => {
      const line = currentReleaseLine(lang, '4.5.3', 'One pass');
      const real = after(file)
        .split('\n')
        .find((l) => l.startsWith(lang === 'en' ? 'Current release:' : 'Release actuelle :'))!;
      expect(real.startsWith(line.replace(/ ?TODO\(release\)$/, ''))).toBe(true);
      const replaced = withCurrentRelease(before(file), lang, '4.5.3', 'One pass');
      expect(replaced).toContain(line);
      expect(replaced.split('\n').length).toBeLessThanOrEqual(before(file).split('\n').length);
    });
  }
});

describe('what is left to write', () => {
  it('is every TODO(release), with its file and line', () => {
    expect(
      todoMarkers([
        { path: 'a.md', text: 'one\nTODO(release): two\nthree' },
        { path: 'b.md', text: 'nothing' },
      ]),
    ).toEqual(['a.md:2']);
  });
});
