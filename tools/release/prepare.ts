// npm run release -- prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run]
// npm run release -- check <x.y.z>
// (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) `prepare` makes the release pull request: the branch
// `release/<x.y.z>`, every file the tools already generate (version, CHANGELOG and LOG from the fragments, transition
// pages, golden save, reference run, quality baseline), the files a release branch used to write by hand (the passes
// sheet, passIssues, the CHANGELOG's heading, the LOG's release entry, the upgrade notes' section, the README's current
// release), and the pull request. It never invents prose: every part that needs a sentence carries `TODO(release)`,
// and `check` fails while one is left. The helpers below are pure and tested against 4.5.3's release commit
// (tests/release-prepare.test.ts); the commands they run are the ones 4.5.3's release ran by hand, in its order.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseNotes } from '../../scripts/release-notes.mjs';
import { lastLogNumber } from '../changes';
import { formatJson } from '../wiki/json';
// @ts-expect-error: a plain .mjs module without declarations
import { REPO, releaseRemote } from './lib.mjs';

const TODO = 'TODO(release)';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const parts = (v: string) => SEMVER.exec(v)!.slice(1).map(Number) as [number, number, number];

/** Why `next` cannot be prepared after `current` (package.json's), or nothing. */
export function nextVersionProblem(current: string, next: string): string | undefined {
  if (!SEMVER.test(next))
    return `${next} is not x.y.z (a release candidate is a tag of a prepared release, not a release)`;
  const [a, b] = [parts(current), parts(next)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (cmp >= 0) return `${next} is not greater than ${current}, the version package.json is at`;
  return undefined;
}

/** The wiki page that holds the upgrade notes of a version's minor line. */
export const upgradeNotesPage = (version: string) => {
  const [major, minor] = parts(version);
  return `install.upgrade-notes-${major}-${minor}`;
};

/** The CHANGELOG heading of a release. */
export const releaseHeading = (version: string, date: string) => `## ${version} — ${date}`;

/** The paragraph that opens a release's CHANGELOG section: the LOG range, the name, what it follows; the rest to write. */
export function changelogIntro(o: { version: string; name: string; previous: string; first: number; last: number }) {
  const kind = parts(o.version)[2] > 0 ? 'a patch on' : 'a minor release after';
  return `LOG #${o.first}–#${o.last}: "${o.name}", ${kind} ${o.previous}. ${TODO}: what it changes, for whom, and what a game has to do (Upgrade notes).`;
}

/** The LOG's release entry: its heading and the bullets 4.5.3's had, each to fill. */
export function logReleaseEntry(o: { n: number; date: string; version: string; name: string }) {
  const bullets = [
    'The request',
    'What ships',
    'Fragments',
    'Upgrade notes',
    'Reviews',
    'Fixtures',
    'Passes',
    'Signature',
  ];
  return [
    `## #${o.n} · ${o.date} · Claude · release · ${o.version} "${o.name}": ${TODO}`,
    '',
    ...bullets.map((b) => `- **${b}**: ${TODO}`),
    '',
    `→ next: ${TODO}`,
    '',
  ].join('\n');
}

/** The upgrade-notes page with `version` added to its lead's list of versions (`… 4.5.1 and 4.5.2 changed.`). */
export function upgradeNotesLead(page: string, previous: string, version: string, lang: 'en' | 'fr') {
  const p = previous.replace(/\./g, '\\.');
  if (lang === 'en')
    return page.replace(new RegExp(`\\s+and\\s+${p}\\s+changed\\.`), `, ${previous} and ${version} changed.`);
  return page.replace(
    new RegExp(`\\s+et\\s+la\\s+${p}\\s+ont\\s+changé\\.`),
    `, la ${previous} et la ${version} ont changé.`,
  );
}

/** A release's section of its upgrade notes: anchor, scope, heading, the text to write, the assembled bullets to start from. */
export function upgradeNotesSection(o: {
  previous: string;
  version: string;
  name: string;
  lang: 'en' | 'fr';
  bullets: readonly string[];
}) {
  const anchor = `from-${o.previous.replace(/\./g, '-')}-to-${o.version.replace(/\./g, '-')}`;
  const heading =
    o.lang === 'en'
      ? `## From ${o.previous} to ${o.version} "${o.name}"`
      : `## De la ${o.previous} à la ${o.version} « ${o.name} »`;
  const opener =
    o.lang === 'en'
      ? `${TODO}: what changes in a game ("Nothing to change in a game: it builds, plays and saves as on ${o.previous}" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:`
      : `${TODO} : ce qui change dans un jeu (« Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en ${o.previous} » quand rien ne change), puis pour un hébergeur ou un mainteneur. Les entrées du CHANGELOG de la release, à réécrire pour qui met à jour :`;
  return [
    `<a name="${anchor}"></a>`,
    `<!-- applies: ${o.version}.. -->`,
    '',
    heading,
    '',
    opener,
    '',
    ...o.bullets,
    '',
  ].join('\n');
}

/** The passes sheet of `version`: the previous one's table and `field:` lines, its heading, the intro to write. */
export function passesSheet(previousSheet: string, previous: string, version: string) {
  const start = previousSheet.indexOf('<!-- field:begin -->');
  const intro = previousSheet.slice(0, start).split('\n').slice(1);
  const field = intro
    .filter((l) => l.startsWith('`npm run field:'))
    .map((l) => l.replaceAll(`--release=${previous}`, `--release=${version}`));
  return [
    `# Passes, ${version}`,
    '',
    `${TODO}: what ${version} changes for the passes (\`passesFor('${version}')\` against ${previous}'s), which stay open and which are carried.`,
    ...field,
    '',
    previousSheet.slice(start),
  ].join('\n');
}

interface Contracts {
  passIssues: Record<string, Record<string, number>>;
  [k: string]: unknown;
}

/** contracts.json with `version` given, for every pass of `previous`, the same issue. */
export function withPassIssues<T extends Contracts>(contracts: T, previous: string, version: string): T {
  const passIssues = Object.fromEntries(
    Object.entries(contracts.passIssues).map(([pass, by]) => [
      pass,
      previous in by ? { ...by, [version]: by[previous]! } : by,
    ]),
  );
  return { ...contracts, passIssues };
}

const LABEL = { en: 'Current release:', fr: 'Release actuelle :' } as const;

/** The README's current-release line, its summary to write. */
export function currentReleaseLine(lang: 'en' | 'fr', version: string, name: string) {
  const link = `[v${version} (${name})](https://github.com/${REPO}/releases/tag/v${version})`;
  return lang === 'en' ? `${LABEL.en} ${link}: ${TODO}` : `${LABEL.fr} ${link} : ${TODO}`;
}

/**
 * The README with the new release's line opening its current-release paragraph, the releases' history: the previous
 * line's summary is kept below it, under its version ("Over 4.5.2 "Org": …", "Sur la 4.5.2 « Org » : …").
 */
export function withCurrentRelease(readme: string, lang: 'en' | 'fr', version: string, name: string) {
  const lines = readme.split('\n');
  const at = lines.findIndex((l) => l.startsWith(LABEL[lang]));
  if (at < 0) throw new Error(`no "${LABEL[lang]}" line`);
  const m = /\[v(\d+\.\d+\.\d+) \(([^)]+)\)\]\([^)]*\)\s*:\s*(.*)$/.exec(lines[at]!);
  if (!m) throw new Error(`the "${LABEL[lang]}" line names no release`);
  const [, previous, previousName, rest] = m;
  const over =
    lang === 'en' ? `Over ${previous} "${previousName}": ${rest}` : `Sur la ${previous} « ${previousName} » : ${rest}`;
  lines.splice(at, 1, currentReleaseLine(lang, version, name), over);
  return lines.join('\n');
}

/** The CHANGELOG with `## Unreleased` become the release's heading, then its intro; the lines around kept. */
export function withReleaseSection(changelog: string, heading: string, intro: string) {
  const lines = changelog.split('\n');
  const at = lines.findIndex((l) => /^## Unreleased[ \t]*$/.test(l));
  if (at < 0) throw new Error('CHANGELOG.md has no "## Unreleased" section (npm run changes -- --assemble makes it)');
  lines.splice(at, 1, heading, '', intro);
  return lines.join('\n');
}

/** Every `TODO(release)` left, as `file:line`. */
export function todoMarkers(files: readonly { path: string; text: string }[]) {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((l, i) => (l.includes(TODO) ? [`${path}:${i + 1}`] : [])),
  );
}

/** What `prepare` refuses before it writes anything, each with what to do. */
export function prepareRefusals(o: {
  current: string;
  version: string;
  dirty: boolean;
  branch: string;
  shallow: boolean;
  upToDate: boolean;
  upgradeNotes: boolean;
}): string[] {
  const out: string[] = [];
  const v = nextVersionProblem(o.current, o.version);
  if (v) out.push(v);
  if (o.dirty) out.push('the checkout has uncommitted changes: commit or set them aside first');
  if (o.branch !== 'main') out.push(`the checkout is on ${o.branch}: prepare runs on main (git switch main)`);
  if (o.shallow) out.push('a shallow clone dates every fragment at its boundary: git fetch --unshallow');
  if (!o.upToDate) out.push("main is not up to date with the organisation's: git pull first");
  if (!v && !o.upgradeNotes)
    out.push(
      `${upgradeNotesPage(o.version)} does not exist: a new minor needs its upgrade-notes page first (wiki/en and wiki/fr, wiki/manifest.json)`,
    );
  return out;
}

/** The steps of `prepare`, in 4.5.3's order. */
export const PREPARE_STEPS = [
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
  'pull request',
] as const;

interface CheckDeps {
  read: (file: string) => string;
  /** The files a release writes prose into. */
  todoFiles: () => string[];
  /** Runs a command: its exit code and what it printed. */
  run: (cmd: string, args: string[]) => { code: number; out: string };
}

/** What `check` says of a prepared release, item by item. */
export async function checkRelease(version: string, deps: CheckDeps) {
  const pkg = JSON.parse(deps.read('package.json') || '{}') as { version?: string };
  const todos = todoMarkers(deps.todoFiles().map((path) => ({ path, text: deps.read(path) })));
  const wiki = deps.run('npm', ['run', '-s', 'wiki', '--', 'check']);
  return [
    { what: `package.json is at ${version}`, ok: pkg.version === version, detail: `it is at ${pkg.version}` },
    {
      what: `CHANGELOG.md has a ${version} section`,
      ok: releaseNotes(deps.read('CHANGELOG.md'), `v${version}`) !== null,
      detail: `no "## ${version}" heading`,
    },
    { what: `no ${TODO} left`, ok: todos.length === 0, detail: todos.join(', ') },
    {
      what: 'npm run wiki -- check: no warning',
      ok: wiki.code === 0 && /\b0 warning\(s\)/.test(wiki.out),
      detail: 'see npm run wiki -- check',
    },
    {
      what: 'npm run quality:baseline -- --check',
      ok: deps.run('npm', ['run', '-s', 'quality:baseline', '--', '--check']).code === 0,
      detail: 'see npm run quality:baseline -- --check',
    },
  ];
}

// ——— The command line. Everything below runs in the repository's root, the commands 4.5.3's release ran by hand.

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
const capture = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const file = (f: string) => join(ROOT, f);
const read = (f: string) => (existsSync(file(f)) ? readFileSync(file(f), 'utf8') : '');
const say = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`);
const today = () => new Date().toISOString().slice(0, 10);

function todoFiles(version: string) {
  return [
    'CHANGELOG.md',
    'docs/dev/LOG.md',
    'README.md',
    'README.fr.md',
    `docs/dev/passes/${version}.md`,
    `wiki/en/${upgradeNotesPage(version)}.md`,
    `wiki/fr/${upgradeNotesPage(version)}.md`,
  ];
}

/** The newest passes sheet's version (docs/dev/passes/<x.y.z>.md). */
function newestSheet() {
  return readdirSync(file('docs/dev/passes'))
    .map((f) => /^(\d+\.\d+\.\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .sort((a, b) => {
      const [x, y] = [parts(a), parts(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .at(-1)!;
}

/** The section of `version` in the CHANGELOG: its bullets, to start the upgrade notes from. */
function sectionBullets(changelog: string, version: string) {
  const notes = releaseNotes(changelog, `v${version}`) ?? '';
  return notes.split('\n').filter((l) => l.startsWith('- '));
}

function prepare(version: string, opts: { name: string; date: string; pr: boolean; dryRun: boolean }) {
  const current = JSON.parse(read('package.json')).version as string;
  let remote: string | undefined;
  try {
    remote = releaseRemote();
  } catch {
    remote = undefined;
  }
  if (remote) spawnSync('git', ['fetch', '--quiet', remote, 'main'], { cwd: ROOT });
  const head = sh('git', ['rev-parse', 'HEAD']);
  const theirs = remote
    ? spawnSync('git', ['rev-parse', `${remote}/main`], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
    : '';
  const refusals = prepareRefusals({
    current,
    version,
    dirty: sh('git', ['status', '--porcelain']) !== '',
    branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    shallow: sh('git', ['rev-parse', '--is-shallow-repository']) === 'true',
    upToDate: !!remote && head === theirs,
    upgradeNotes: existsSync(file(`wiki/en/${upgradeNotesPage(version)}.md`)),
  });
  if (refusals.length) {
    for (const r of refusals) console.error(`✖  ${r}`);
    if (!opts.dryRun) process.exit(1);
  }
  if (!opts.name) {
    console.error('✖  --name="<the release\'s name>" is required (4.5.3 was "One pass")');
    process.exit(1);
  }
  const previous = current;
  const branch = `release/${version}`;
  const steps: Record<(typeof PREPARE_STEPS)[number], () => void> = {
    branch: () => sh('git', ['switch', '-c', branch]),
    version: () => sh('npm', ['version', version, '--no-git-tag-version']),
    changelog: () => {
      const first = lastLogNumber(read('docs/dev/LOG.md')) + 1;
      sh('npm', ['run', '-s', 'changes', '--', '--assemble', `--date=${opts.date}`]);
      const last = lastLogNumber(read('docs/dev/LOG.md')) + 1;
      const intro = changelogIntro({ version, name: opts.name, previous, first, last });
      const changelog = read('CHANGELOG.md');
      writeFileSync(file('CHANGELOG.md'), withReleaseSection(changelog, releaseHeading(version, opts.date), intro));
      const log = read('docs/dev/LOG.md').replace(/\n*$/, '\n\n');
      writeFileSync(
        file('docs/dev/LOG.md'),
        log + logReleaseEntry({ n: last, date: opts.date, version, name: opts.name }),
      );
    },
    'upgrade notes': () => {
      const bullets = sectionBullets(read('CHANGELOG.md'), version);
      for (const lang of ['en', 'fr'] as const) {
        const page = `wiki/${lang}/${upgradeNotesPage(version)}.md`;
        const text = upgradeNotesLead(read(page), previous, version, lang).replace(/\n*$/, '\n\n');
        writeFileSync(file(page), text + upgradeNotesSection({ previous, version, name: opts.name, lang, bullets }));
      }
    },
    'transition pages': () => sh('npm', ['run', '-s', 'wiki', '--', 'transition']),
    'golden save': () => {
      sh('npx', ['tsx', 'tools/golden-save.ts', version]);
      const index = JSON.parse(read('tests/fixtures/saves/index.json')) as { demo: string[] };
      writeFileSync(
        file('tests/fixtures/saves/index.json'),
        `${JSON.stringify({ demo: [...index.demo, version] }, null, 2)}\n`,
      );
    },
    'reference run': () => sh('npx', ['tsx', 'tools/speedrun/reference-run.ts'], { GAME: 'reference' }),
    passes: () => {
      const sheet = newestSheet();
      writeFileSync(
        file(`docs/dev/passes/${version}.md`),
        passesSheet(read(`docs/dev/passes/${sheet}.md`), sheet, version),
      );
      const contracts = JSON.parse(read('docs/dev/contracts.json'));
      writeFileSync(file('docs/dev/contracts.json'), formatJson(withPassIssues(contracts, sheet, version)));
    },
    readme: () => {
      for (const [lang, f] of [
        ['en', 'README.md'],
        ['fr', 'README.fr.md'],
      ] as const)
        writeFileSync(file(f), withCurrentRelease(read(f), lang, version, opts.name));
    },
    'quality baseline': () => sh('npm', ['run', '-s', 'quality:baseline']),
    commit: () => {
      sh('git', ['add', '-A']);
      sh('git', ['commit', '-q', '-m', `${version}: the release (prepared by npm run release -- prepare)`]);
    },
    'pull request': () => {
      if (!opts.pr) return say('--no-pr: nothing pushed');
      const remotes = sh('git', ['remote', '-v']);
      const fork = remotes
        .split('\n')
        .map((l) => l.split(/\s+/))
        .find(([n, , kind]) => kind === '(fetch)' && n !== remote)?.[0];
      const pushTo = fork ?? remote;
      if (!pushTo) throw new Error('no git remote to push the release branch to');
      sh('git', ['push', '-q', '-u', pushTo, branch]);
      const url =
        remotes
          .split('\n')
          .find((l) => l.startsWith(`${pushTo}\t`))
          ?.split(/\s+/)[1] ?? '';
      const owner = /github\.com[:/]([^/]+)\//.exec(url)?.[1];
      const left = todoMarkers(todoFiles(version).map((path) => ({ path, text: read(path) })));
      const body = [
        `## What changes`,
        '',
        `Release ${version} "${opts.name}", prepared by \`npm run release -- prepare\`: version, CHANGELOG and LOG from the fragments, transition pages, golden save, reference run, passes sheet and passIssues, README, quality baseline.`,
        '',
        `## Left to write (\`npm run release -- check ${version}\` lists them)`,
        '',
        ...left.map((l) => `- [ ] \`${l}\``),
        '',
        'Then record the changed translation pairs (`npm run wiki -- check` prints each command, `--kind ai --relation author` for an assistant).',
      ].join('\n');
      const head = owner && fork && owner !== REPO.split('/')[0] ? `${owner}:${branch}` : branch;
      say(
        sh('gh', [
          'pr',
          'create',
          '--repo',
          REPO,
          '--base',
          'main',
          '--head',
          head,
          '--title',
          `${version}: the release`,
          '--body',
          body,
        ]),
      );
    },
  };
  for (const name of PREPARE_STEPS) {
    if (opts.dryRun) {
      say(`would run: ${name}`);
      continue;
    }
    say(`${name}…`);
    steps[name]();
  }
  if (opts.dryRun) process.exit(refusals.length ? 1 : 0);
  say(`✔  ${branch} prepared: npm run release -- check ${version} says what is left`);
}

async function check(version: string) {
  const items = await checkRelease(version, { read, todoFiles: () => todoFiles(version), run: capture });
  for (const i of items) console.log(`${i.ok ? '✔' : '✖'}  ${i.what}${i.ok ? '' : `: ${i.detail}`}`);
  process.exit(items.every((i) => i.ok) ? 0 : 1);
}

if (process.argv[1]?.endsWith('prepare.ts')) {
  const [verb, version, ...rest] = process.argv.slice(2);
  const opt = (k: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (verb === 'prepare' && version)
    prepare(version, {
      name: opt('name') ?? '',
      date: opt('date') ?? today(),
      pr: !rest.includes('--no-pr'),
      dryRun: rest.includes('--dry-run'),
    });
  else if (verb === 'check' && version) await check(version);
  else {
    console.error(
      'usage: npm run release -- prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run] | check <x.y.z>',
    );
    process.exit(2);
  }
}
