// `npm run release -- prepare <version>` (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md): the helpers that
// write a release's files, each checked against what the 4.5.3 release commit (2afb9f51) wrote by hand, from the files
// as they were before it (its parent). Prose is never invented: a helper leaves `TODO(release)` where it is needed.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  changelogBullets,
  changelogIntro,
  checkRelease,
  beforePushStop,
  humanGates,
  isPrepared,
  PREPARE_STEPS,
  preparedSubject,
  prepareRefusals,
  RESUME_STEPS,
  resumeRefusals,
  pushTarget,
  wayBack,
  currentReleaseLine,
  logReleaseEntry,
  nextVersionProblem,
  passesSheet,
  releaseHeading,
  todoBrief,
  todoMarkers,
  upgradeNotesLead,
  upgradeNotesPage,
  upgradeNotesSection,
  withCurrentRelease,
  withReleaseSection,
  withPassIssues,
} from '../tools/release/prepare';

// The files as 4.5.3's release commit (2afb9f51) found and left them, kept as fixtures (CI checks out without history):
// tests/fixtures/release-4.5.3/before and after; the CHANGELOG's head and the LOG's release line only.
const FIX = 'tests/fixtures/release-4.5.3';
const at = (side: string, file: string) =>
  readFileSync(join(FIX, side, file === 'docs/dev/LOG.md' ? 'LOG.md' : file), 'utf8');
const before = (file: string) => at('before', file);
const after = (file: string) => at('after', file);
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
  it('turns Unreleased into the release’s heading and intro, the blank lines kept', () => {
    expect(withReleaseSection('# C\n\n## Unreleased\n\n### Changes\n\n- x\n', '## 4.5.4 — d', 'Intro.')).toBe(
      '# C\n\n## 4.5.4 — d\n\nIntro.\n\n### Changes\n\n- x\n',
    );
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

describe('the CHANGELOG bullets the upgrade notes start from (#333)', () => {
  const changelog = [
    '# Changelog',
    '',
    '## 4.5.5 — 2026-10-26',
    '',
    'LOG #1–#2: "Name", a patch on 4.5.4. The intro,',
    'over two lines.',
    '',
    '### Fixed',
    '',
    '- **A wrapped bullet** (#1): its first line, then',
    '  its second line, and',
    '  its third.',
    '',
    '- **A bullet with a list**:',
    '  - a first point,',
    '    wrapped;',
    '  - a second point.',
    '- **Right after, no blank line**.',
    '',
    '### Changes',
    '',
    '- **A bullet with a paragraph**: the first one.',
    '',
    '  A second paragraph of the same bullet.',
    '',
    '- **The last one** (D99).',
    '',
    '## 4.5.4 — 2026-10-25',
    '',
    '- **Not this release**.',
    '',
  ].join('\n');
  it('gives every bullet whole, with its continuation lines and its list; no heading, intro or blank line between', () => {
    expect(changelogBullets(changelog, '4.5.5')).toEqual([
      '- **A wrapped bullet** (#1): its first line, then\n  its second line, and\n  its third.',
      '- **A bullet with a list**:\n  - a first point,\n    wrapped;\n  - a second point.',
      '- **Right after, no blank line**.',
      '- **A bullet with a paragraph**: the first one.\n\n  A second paragraph of the same bullet.',
      '- **The last one**.',
    ]);
  });
  it('makes one tight list of the upgrade notes, each bullet whole', () => {
    const section = upgradeNotesSection({
      previous: '4.5.4',
      version: '4.5.5',
      name: 'Name',
      lang: 'en',
      bullets: changelogBullets(changelog, '4.5.5'),
    });
    expect(section).toContain(
      '- **A wrapped bullet** (#1): its first line, then\n  its second line, and\n  its third.\n- **A bullet with a list**:',
    );
    expect(section).not.toContain('###');
    expect(section).not.toContain('Not this release');
  });
  it('is empty for a version without a section', () => {
    expect(changelogBullets(changelog, '4.5.6')).toEqual([]);
  });
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
      // The paragraph is the releases' history: the new line first, the previous summary kept under its version.
      const old = before(file).split('\n');
      const at = old.findIndex((l) => l.startsWith(lang === 'en' ? 'Current release:' : 'Release actuelle :'));
      const rest = old[at]!.replace(/^.*?\]\([^)]*\)\s*:\s*/, '');
      const replaced = withCurrentRelease(before(file), lang, '4.5.3', 'One pass').split('\n');
      expect(replaced[at]).toBe(line);
      expect(replaced[at + 1]).toBe(lang === 'en' ? `Over 4.5.2 "Org": ${rest}` : `Sur la 4.5.2 « Org » : ${rest}`);
      expect(replaced.slice(at + 2)).toEqual(old.slice(at + 1));
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
  it('gives each one its line as the brief, the same markers check counts (4.5.5)', () => {
    const files = [
      { path: 'CHANGELOG.md', text: '# C\n\nLOG #1–#2: "N", a patch on 4.5.4. TODO(release): what it changes.\n' },
      { path: 'LOG.md', text: '- **The request**: TODO(release)' },
      { path: 'README.md', text: 'nothing' },
    ];
    expect(todoBrief(files)).toEqual([
      { at: 'CHANGELOG.md:3', what: 'LOG #1–#2: "N", a patch on 4.5.4. TODO(release): what it changes.' },
      { at: 'LOG.md:1', what: '- **The request**: TODO(release)' },
    ]);
    expect(todoBrief(files).map((t) => t.at)).toEqual(todoMarkers(files));
    const long = `TODO(release): ${'x'.repeat(300)}`;
    expect(todoBrief([{ path: 'a', text: long }])[0]!.what.length).toBeLessThanOrEqual(200);
  });
});

describe('the command', () => {
  const ok = {
    current: '4.5.3',
    version: '4.5.4',
    dirty: false,
    branch: 'main',
    shallow: false,
    upToDate: true,
    upgradeNotes: true,
    fragments: 3,
    pr: undefined as string | undefined,
  };
  it('refuses, before writing anything, what would make a wrong release branch', () => {
    expect(prepareRefusals(ok)).toEqual([]);
    expect(prepareRefusals({ ...ok, version: '4.5.3' })).toEqual([expect.stringMatching(/not greater/)]);
    expect(prepareRefusals({ ...ok, dirty: true })).toEqual([expect.stringMatching(/uncommitted/)]);
    expect(prepareRefusals({ ...ok, branch: 'feature/x' })).toEqual([expect.stringMatching(/on main/)]);
    expect(prepareRefusals({ ...ok, shallow: true })).toEqual([expect.stringMatching(/unshallow/)]);
    expect(prepareRefusals({ ...ok, upToDate: false })).toEqual([expect.stringMatching(/up to date/)]);
    expect(prepareRefusals({ ...ok, fragments: 0 })).toEqual([expect.stringMatching(/no fragment/)]);
    expect(prepareRefusals({ ...ok, pr: 'gh is not signed in: gh auth login' })).toEqual([
      'gh is not signed in: gh auth login',
    ]);
    expect(prepareRefusals({ ...ok, version: '4.6.0', upgradeNotes: false })).toEqual([
      expect.stringMatching(/install\.upgrade-notes-4-6/),
    ]);
  });
  it("runs 4.5.3's steps in 4.5.3's order, the quality baseline last before the commit", () => {
    expect(PREPARE_STEPS).toEqual([
      'branch',
      'version',
      'changelog',
      'upgrade notes',
      'transition pages',
      'golden save',
      'reference run',
      'passes',
      'readme',
      'quality baseline',
      'commit',
      'before the push',
      'pull request',
    ]);
  });
  it('resumes a prepared branch with the stop before the push (prose and human gates) and the pull request only', () => {
    expect(RESUME_STEPS).toEqual(['before the push', 'pull request']);
  });
  it('checks a prepared release: its section, no TODO(release) left, the wiki and the baseline', async () => {
    const files: Record<string, string> = {
      'package.json': '{"version":"4.5.4"}',
      'CHANGELOG.md': '# Changelog\n\n## 4.5.4 — 2026-10-26\n\nLOG #1–#2: TODO(release): …\n\n## 4.5.3 — 2026-10-25\n',
    };
    const deps = {
      read: (f: string) => files[f] ?? '',
      todoFiles: () => ['CHANGELOG.md'],
      run: () => ({ code: 0, out: '✔  wiki (work level): 214 pages consistent, 0 warning(s)' }),
    };
    const items = await checkRelease('4.5.4', deps);
    expect(items.map((i) => [i.what, i.ok])).toEqual([
      ['package.json is at 4.5.4', true],
      ['CHANGELOG.md has a 4.5.4 section', true],
      ['no TODO(release) left', false],
      ['npm run wiki -- check: no warning', true],
      ["the docs' human gates (wiki -- check --publish --reviews-only)", true],
      ['npm run quality:baseline -- --check', true],
    ]);
    expect(items[2]!.detail).toBe('CHANGELOG.md:5');
    // A red docs gate names what to do: the ✖ lines of the wiki's own output.
    const failing = await checkRelease('4.5.4', {
      ...deps,
      run: (_cmd: string, args: string[]) =>
        args.includes('--reviews-only')
          ? {
              code: 1,
              out: '·  claim x: referenced\n✖  play.saves: the claim c is self-checked by the author (AI), not reviewed: npm run wiki -- review-claim c --by <name> --kind human --relation independent\n✖  wiki (publication level): 1 error(s)\n',
            }
          : { code: 0, out: '0 warning(s)' },
    });
    const gates = failing.find((i) => i.what.startsWith("the docs' human gates"))!;
    expect(gates.ok).toBe(false);
    expect(gates.detail).toContain('npm run wiki -- review-claim c --by <name> --kind human --relation independent');
    expect(gates.detail).not.toContain('claim x: referenced');
    const none = await checkRelease('4.5.5', deps);
    expect(none.slice(0, 2).map((i) => i.ok)).toEqual([false, false]);
  });
});

describe('the stop before the push: prose left and human gates (4.5.5)', () => {
  const CLAIM =
    '✖  play.saves: the claim c is self-checked by the author (AI), not reviewed: npm run wiki -- review-claim c --by <name> --kind human --relation independent';
  it('are the wiki check’s ✖ lines, each with its command, nothing else', () => {
    const run = (_cmd: string, args: string[]) => {
      expect(args).toContain('--reviews-only');
      return { code: 1, out: `·  claim x: referenced\n${CLAIM}\n✖  wiki (publication level): 1 error(s)\n` };
    };
    expect(humanGates(run)).toEqual({ ok: false, detail: `${CLAIM}\n✖  wiki (publication level): 1 error(s)` });
    expect(humanGates(() => ({ code: 0, out: '✔  wiki (publication level): 0 error(s)' }))).toEqual({
      ok: true,
      detail: '',
    });
  });
  const TODOS = [
    { at: 'CHANGELOG.md:5', what: 'LOG #1–#2: "Once", a patch on 4.5.4. TODO(release): what it changes' },
    { at: 'README.md:12', what: 'Current release: [v4.5.5 (Once)](…): TODO(release)' },
  ];
  const base = { version: '4.5.5', name: 'Once', branch: 'release/4.5.5', pr: true };
  const clean = { ok: true, detail: '' };
  const red = { ok: false, detail: CLAIM };
  it('let prepare push only when no TODO(release) is left and the gates hold', () => {
    expect(beforePushStop({ ...base, todos: [], gates: clean })).toBeUndefined();
    expect(beforePushStop({ ...base, todos: TODOS, gates: clean })).toBeDefined();
    expect(beforePushStop({ ...base, todos: [], gates: red })).toBeDefined();
  });
  it('stop prepare with what to review and the same command to run again, a person typing each review', () => {
    const msg = beforePushStop({ ...base, todos: [], gates: red })!;
    expect(msg).toContain(CLAIM);
    expect(msg).toMatch(/nothing (was|is) pushed/i);
    expect(msg).toContain('npm run release -- prepare 4.5.5 --name="Once"');
    expect(msg).not.toContain('--no-pr');
    expect(msg).toContain('release/4.5.5');
    // The tool names the command; it never fills a reviewer in.
    expect(msg).not.toMatch(/--by (?!<name>)\S/);
    expect(beforePushStop({ ...base, pr: false, todos: [], gates: red })).toContain(
      'npm run release -- prepare 4.5.5 --name="Once" --no-pr',
    );
  });
  it('list each TODO(release) with its file, line and brief, for a person or their assistant to write', () => {
    const msg = beforePushStop({ ...base, todos: TODOS, gates: clean })!;
    for (const t of TODOS) {
      expect(msg).toContain(t.at);
      expect(msg).toContain(t.what);
    }
    expect(msg).toMatch(/nothing (was|is) pushed/i);
    expect(msg).toMatch(/AI assistant/);
    expect(msg).toMatch(/diff/);
    expect(msg).toMatch(/commit/i);
    expect(msg).toContain('npm run release -- prepare 4.5.5 --name="Once"');
    expect(msg).not.toContain(CLAIM);
  });
  it('say the prose and the reviews in one stop, so one run again covers both', () => {
    const msg = beforePushStop({ ...base, todos: TODOS, gates: red })!;
    expect(msg).toContain(TODOS[0]!.at);
    expect(msg).toContain(CLAIM);
    expect(msg.match(/npm run release -- prepare 4\.5\.5/g)).toHaveLength(1);
    expect(msg.indexOf(TODOS[0]!.at)).toBeLessThan(msg.indexOf(CLAIM));
  });
});

describe('a prepare run again on its branch (4.5.5)', () => {
  const ok = {
    current: '4.5.5',
    version: '4.5.5',
    branch: 'release/4.5.5',
    dirty: false,
    prepared: true,
    shallow: false,
    pr: undefined as string | undefined,
  };
  it('is a resume only on release/<version>: elsewhere the first run’s refusals apply', () => {
    expect(resumeRefusals({ ...ok, branch: 'main' })).toBeUndefined();
    expect(resumeRefusals({ ...ok, branch: 'release/4.5.4' })).toBeUndefined();
    expect(resumeRefusals({ ...ok, branch: 'feature/x' })).toBeUndefined();
  });
  it('resumes a clean branch at the version that holds the prepared commit', () => {
    expect(resumeRefusals(ok)).toEqual([]);
  });
  it('refuses a branch it did not prepare, a version not bumped, uncommitted reviews, no place to push', () => {
    expect(resumeRefusals({ ...ok, prepared: false })).toEqual([expect.stringMatching(/prepared commit/)]);
    expect(resumeRefusals({ ...ok, current: '4.5.4' })).toEqual([expect.stringMatching(/package\.json is at 4\.5\.4/)]);
    expect(resumeRefusals({ ...ok, dirty: true })).toEqual([expect.stringMatching(/uncommitted.*commit/)]);
    expect(resumeRefusals({ ...ok, shallow: true })).toEqual([expect.stringMatching(/unshallow/)]);
    expect(resumeRefusals({ ...ok, pr: 'gh is not signed in' })).toEqual(['gh is not signed in']);
  });
  it('knows its prepared commit among the branch’s commits by its subject', () => {
    expect(preparedSubject('4.5.5')).toBe('4.5.5: the release (prepared by npm run release -- prepare)');
    expect(isPrepared(`4.5.5: reviews\n${preparedSubject('4.5.5')}\n`, '4.5.5')).toBe(true);
    expect(isPrepared(preparedSubject('4.5.4'), '4.5.5')).toBe(false);
    expect(isPrepared(`x ${preparedSubject('4.5.5')}`, '4.5.5')).toBe(false);
    expect(isPrepared('', '4.5.5')).toBe(false);
  });
});

describe('where the release branch is pushed', () => {
  const r = (...rows: [string, string][]) => rows.map(([n, u]) => `${n}\t${u} (fetch)\n${n}\t${u} (push)`).join('\n');
  const ORG = 'Quest-n-Click/quest-n-click';
  it('is the fork: origin when it is a GitHub fork, whatever other remotes sort before it', () => {
    expect(
      pushTarget(
        r(
          ['backup', 'git@gitlab.com:me/x.git'],
          ['clever', 'git+ssh://git@push.clever-cloud.com/app.git'],
          ['origin', 'git@github.com:LostInBrittany/quest-n-click.git'],
          ['upstream', 'git@github.com:Quest-n-Click/quest-n-click.git'],
        ),
        ORG,
      ),
    ).toEqual({ remote: 'origin', head: 'LostInBrittany:' });
  });
  it('is the one GitHub fork of the repository when origin is not one', () => {
    expect(
      pushTarget(
        r(
          ['fork', 'https://github.com/someone/quest-n-click'],
          ['origin', 'git@github.com:Quest-n-Click/quest-n-click.git'],
        ),
        ORG,
      ),
    ).toEqual({ remote: 'fork', head: 'someone:' });
  });
  it("is the organisation's repository itself when no fork is a remote (a branch, never main)", () => {
    expect(pushTarget(r(['origin', 'git@github.com:Quest-n-Click/quest-n-click.git']), ORG)).toEqual({
      remote: 'origin',
      head: '',
    });
  });
  it('is refused when two forks could be it, or when nothing is the repository', () => {
    expect(
      pushTarget(r(['a', 'git@github.com:x/quest-n-click.git'], ['b', 'git@github.com:y/quest-n-click.git']), ORG),
    ).toEqual({ problem: expect.stringMatching(/two forks/) });
    expect(pushTarget(r(['origin', 'git@gitlab.com:me/x.git']), ORG)).toEqual({
      problem: expect.stringMatching(/no remote/),
    });
  });
});

describe('an upgrade-notes lead it cannot extend', () => {
  it('gets a TODO(release) under its title rather than nothing', () => {
    const page = '# Upgrade notes: 4.6\n\nWhat 4.6.0 changed.\n';
    const out = upgradeNotesLead(page, '4.5.9', '4.6.1', 'en');
    expect(out).toContain('TODO(release)');
    expect(out.split('\n')[0]).toBe('# Upgrade notes: 4.6');
  });
});

describe('when a step fails', () => {
  it('says how to start again before the commit, and how to finish by hand after it', () => {
    expect(wayBack('golden save', '4.5.4', 'release/4.5.4')).toContain(
      'git switch main && git branch -D release/4.5.4',
    );
    const pr = wayBack('pull request', '4.5.4', 'release/4.5.4', { remote: 'origin', head: 'LostInBrittany:' });
    expect(pr).toContain('git push -u origin release/4.5.4');
    expect(pr).toContain('--head LostInBrittany:release/4.5.4');
  });
});

describe('the command on a clone (4.5.4)', () => {
  /** A clone of this checkout on main with the tools under test committed, `prepare` run in it with `args`. */
  function onClone(setup: (git: (...a: string[]) => string, repo: string) => void, args: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'release-prepare-'));
    try {
      const repo = join(dir, 'repo');
      const git = (...a: string[]) =>
        execFileSync(
          'git',
          ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a],
          {
            encoding: 'utf8',
          },
        ).trim();
      execFileSync('git', ['clone', '-q', '--local', resolve('.'), repo]);
      git('checkout', '-q', '-B', 'main');
      // The clone holds the committed tools; the ones under test are copied over and committed.
      for (const f of ['tools/release/prepare.ts', 'tools/changes.ts', 'tools/release/lib.mjs'])
        cpSync(resolve(f), join(repo, f));
      git('commit', '-q', '-am', 'tools', '--allow-empty');
      // A junction, which Windows makes without rights (a symlink elsewhere).
      symlinkSync(resolve('node_modules'), join(repo, 'node_modules'), 'junction');
      setup(git, repo);
      const before = { status: git('status', '--porcelain'), head: git('rev-parse', 'HEAD') };
      const r = spawnSync(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), 'tools/release/prepare.ts', 'prepare', ...args],
        { cwd: repo, encoding: 'utf8' },
      );
      return {
        r,
        before,
        after: { status: git('status', '--porcelain'), head: git('rev-parse', 'HEAD') },
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        releases: git('branch', '--list', 'release/*'),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  it('refuses a dirty main and leaves the clone exactly as it was: no branch, no file written', () => {
    const run = onClone((_git, repo) => writeFileSync(join(repo, 'stray.txt'), 'x'), ['4.5.4', '--name=T', '--no-pr']);
    expect(run.r.status).toBe(1);
    expect(run.r.stderr).toMatch(/uncommitted/);
    expect(run.after).toEqual(run.before);
    expect(run.branch).toBe('main');
    expect(run.releases).toBe('');
  }, 60_000);
  it('run again on a release branch it did not prepare, refuses to resume and changes nothing (4.5.5)', () => {
    const run = onClone((git) => git('switch', '-q', '-c', 'release/4.5.4'), ['4.5.4', '--name=T', '--no-pr']);
    expect(run.r.status).toBe(1);
    expect(run.r.stderr).toMatch(/release\/4\.5\.4 holds no prepared commit/);
    expect(run.r.stdout).not.toMatch(/resuming/);
    expect(run.after).toEqual(run.before);
    expect(run.branch).toBe('release/4.5.4');
  }, 60_000);
});
