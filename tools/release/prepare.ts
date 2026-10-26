// npm run release -- prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run]
// npm run release -- check <x.y.z>
// (4.5.5) Before it pushes, `prepare` checks what the pull request's CI would fail on: a `TODO(release)` left (each with
// its brief, for a person or their assistant to write) and the docs' human gates (a claim or a pair still to review,
// each with its command for a person to type), in one stop, nothing pushed. The tool never writes prose nor records a
// review; the same command, run again on `release/<x.y.z>` once they are committed, resumes there.
// (4.5.5, #331) When it pushes, it starts the warm-up of main's mutation cache (the nightly's mutation jobs, #330), so
// the candidate the merge starts reuses it; a dispatch refused is a warning with the command, never a failure.
// (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) `prepare` makes the release pull request: the branch
// `release/<x.y.z>`, every file the tools already generate (version, CHANGELOG and LOG from the fragments, transition
// pages, golden save, reference run, quality baseline), the files a release branch used to write by hand (the passes
// sheet, passIssues, the CHANGELOG's heading, the LOG's release entry, the upgrade notes' section, the README's current
// release), and the pull request. It never invents prose: every part that needs a sentence carries `TODO(release)`,
// and `check` fails while one is left. The helpers below are pure and tested against 4.5.3's release commit
// (tests/release-prepare.test.ts); the commands they run are the ones 4.5.3's release ran by hand, in its order.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseNotes } from '../../scripts/release-notes.mjs';
import { fragmentFiles, lastLogNumber } from '../changes';
import { formatJson } from '../wiki/json';
// @ts-expect-error: a plain .mjs module without declarations
import { REPO, releaseRemote } from './lib.mjs';
import { humanGates, type Run } from './gates';

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
  const [, minor, patch] = parts(o.version);
  const kind = patch > 0 ? 'a patch on' : minor > 0 ? 'a minor release after' : 'a major release after';
  // One LOG entry (the release's own) is `LOG #N`, never `LOG #N–#N` (#348).
  const range = o.first === o.last ? `#${o.first}` : `#${o.first}–#${o.last}`;
  return `LOG ${range}: "${o.name}", ${kind} ${o.previous}. ${TODO}: what it changes, for whom, and what a game has to do (Upgrade notes).`;
}

/**
 * Why `name` cannot name a release, or nothing (#348). It is written as is into the README's release link
 * (`[v4.5.5 (name)](…)`, read back by the next prepare), the CHANGELOG's and the LOG's quotes, the French « », and the
 * command `prepare` says to run again (`--name="…"`): a character any of them uses is refused, never escaped.
 */
export function releaseNameProblem(name: string): string | undefined {
  if (!name.trim()) return '--name="<the release\'s name>" is required (4.5.3 was "One pass")';
  const bad = [...new Set(name.match(/[()[\]"«»`\\$<>|\n\r\t]/g) ?? [])];
  if (!bad.length) return undefined;
  return `the release name ${JSON.stringify(name)} has ${bad.map((c) => JSON.stringify(c)).join(' ')}: the README's release link, the CHANGELOG's quotes and the command line cannot hold it; choose a name without ( ) [ ] " « » \` \\ $ < > |`;
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
  const out =
    lang === 'en'
      ? page.replace(new RegExp(`\\s+and\\s+${p}\\s+changed\\.`), `, ${previous} and ${version} changed.`)
      : page.replace(
          new RegExp(`\\s+et\\s+la\\s+${p}\\s+ont\\s+changé\\.`),
          `, la ${previous} et la ${version} ont changé.`,
        );
  if (out !== page) return out;
  // A lead worded otherwise (a new minor's page, a rewrite): said where it is, for a person to write.
  const lines = page.split('\n');
  const note =
    lang === 'en'
      ? `${TODO}: name ${version} in this lead.`
      : `${TODO} : nommer la ${version} dans cette introduction.`;
  lines.splice(1, 0, '', note);
  return lines.join('\n');
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

const FIELD_BEGIN = '<!-- field:begin -->';

/** Why the previous passes sheet cannot be copied, or nothing: its table starts at the field:begin marker (#348). */
export const passesSheetProblem = (sheet: string, previous: string) =>
  sheet.includes(FIELD_BEGIN)
    ? undefined
    : `docs/dev/passes/${previous}.md has no ${FIELD_BEGIN} marker: the table prepare copies starts there (docs/dev/passes/TEMPLATE.md has it); put it back above the table`;

/** The passes sheet of `version`: the previous one's table and `field:` lines, its heading, the intro to write. */
export function passesSheet(previousSheet: string, previous: string, version: string) {
  const problem = passesSheetProblem(previousSheet, previous);
  if (problem) throw new Error(problem);
  const start = previousSheet.indexOf(FIELD_BEGIN);
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

const BRIEF = 200;

/** Every `TODO(release)` left: its `file:line` and its line, the brief of what to write there (cut at 200 characters). */
export function todoBrief(files: readonly { path: string; text: string }[]) {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((l, i) => {
      if (!l.includes(TODO)) return [];
      const what = l.trim();
      return [{ at: `${path}:${i + 1}`, what: what.length > BRIEF ? `${what.slice(0, BRIEF - 1)}…` : what }];
    }),
  );
}

/** Every `TODO(release)` left, as `file:line` (what `check` counts, and `prepare` before it pushes). */
export function todoMarkers(files: readonly { path: string; text: string }[]) {
  return todoBrief(files).map((t) => t.at);
}

/**
 * Where the release branch is pushed, from `git remote -v`: the fork (`origin` when it is one, else the only one), or
 * the organisation's repository when no fork is a remote (a branch, never main). `head` prefixes the branch for
 * `gh pr create --head`.
 */
export function pushTarget(remotes: string, repo: string): { remote: string; head: string } | { problem: string } {
  const [org, name] = repo.toLowerCase().split('/');
  const github = remotes
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter(([, , kind]) => kind === '(fetch)')
    .flatMap(([n, url]) => {
      const m = /github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url ?? '');
      return m && m[2]!.toLowerCase() === name ? [{ remote: n!, owner: m[1]! }] : [];
    });
  const forks = github.filter((g) => g.owner.toLowerCase() !== org);
  const fork = forks.find((g) => g.remote === 'origin') ?? (forks.length === 1 ? forks[0] : undefined);
  if (fork) return { remote: fork.remote, head: `${fork.owner}:` };
  if (forks.length > 1)
    return {
      problem: `two forks could take the release branch (${forks.map((f) => f.remote).join(', ')}): make one of them origin`,
    };
  const own = github.find((g) => g.remote === 'origin') ?? github[0];
  if (own) return { remote: own.remote, head: '' };
  return { problem: `no remote is ${repo} or a fork of it on GitHub (git remote -v)` };
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
  /** The fragments in changes/: a release with none has nothing to say. */
  fragments: number;
  /** Why the pull request could not be opened at the end (no push target, gh not signed in), or nothing. */
  pr: string | undefined;
  /** The release's name (`--name`): refused when a file or the command line could not hold it (#348). */
  name?: string;
  /** Why the newest passes sheet cannot be copied (`passesSheetProblem`), or nothing. */
  passes?: string | undefined;
}): string[] {
  const out: string[] = [];
  const v = nextVersionProblem(o.current, o.version);
  if (v) out.push(v);
  if (o.dirty) out.push('the checkout has uncommitted changes: commit or set them aside first');
  if (o.branch !== 'main') out.push(`the checkout is on ${o.branch}: prepare runs on main (git switch main)`);
  if (o.shallow) out.push('a shallow clone dates every fragment at its boundary: git fetch --unshallow');
  if (!o.upToDate) out.push("main is not up to date with the organisation's: git pull first");
  if (o.fragments === 0) out.push('changes/ holds no fragment: a release with nothing to say is not prepared');
  if (o.pr) out.push(o.pr);
  if (!v && !o.upgradeNotes)
    out.push(
      `${upgradeNotesPage(o.version)} does not exist: a new minor needs its upgrade-notes page first (wiki/en and wiki/fr, wiki/manifest.json)`,
    );
  const name = o.name === undefined ? undefined : releaseNameProblem(o.name);
  if (name) out.push(name);
  if (o.passes) out.push(o.passes);
  return out;
}

/**
 * Why a run on `release/<version>` cannot resume the release `prepare` made there (the reviews committed since), or
 * undefined on any other branch: a first run, whose refusals are `prepareRefusals`'.
 */
export function resumeRefusals(o: {
  current: string;
  version: string;
  branch: string;
  dirty: boolean;
  /** The branch holds the prepared commit (`preparedSubject`) over main. */
  prepared: boolean;
  shallow: boolean;
  pr: string | undefined;
}): string[] | undefined {
  if (o.branch !== `release/${o.version}`) return undefined;
  const out: string[] = [];
  const back = `start again from main (git switch main && git branch -D ${o.branch})`;
  if (!o.prepared) out.push(`${o.branch} holds no prepared commit of ${o.version} over main: ${back}`);
  else if (o.current !== o.version) out.push(`package.json is at ${o.current}, not ${o.version}: ${back}`);
  if (o.dirty)
    out.push(
      `${o.branch} has uncommitted changes: commit the prose and the reviews (git add, git commit), then run again`,
    );
  if (o.shallow) out.push('a shallow clone dates every fragment at its boundary: git fetch --unshallow');
  if (o.pr) out.push(o.pr);
  return out;
}

/** Where the step `wiki acks` keeps the fold's list for the stop before the push (gitignored, beside the ship records). */
const foldedFile = (version: string) => `.cache/release/${version}.acks-folded.txt`;

/** The subject of the commit `prepare` makes. */
export const preparedSubject = (version: string) => `${version}: the release (prepared by npm run release -- prepare)`;

/** Whether the commit subjects (`git log --format=%s main..HEAD`, one per line) hold the prepared commit. */
export const isPrepared = (subjects: string, version: string) =>
  subjects.split('\n').some((l) => l.trim() === preparedSubject(version));

// humanGates lives in ./gates (#348): release-run.ts needs it too, and importing it from here made a cycle with the
// dispatch's top-level `await import('./release-run')` below, which never settled.
export { humanGates };

/**
 * What `prepare` says when it cannot push yet, or undefined when it can: the `TODO(release)` prose left (each marker
 * with its brief) and the docs' human gates still red, in one stop, then the same command to run again. It never
 * writes the prose nor records a review: a person does, or their assistant writes the prose from these briefs.
 */
export function beforePushStop(o: {
  version: string;
  name: string;
  branch: string;
  todos: readonly { at: string; what: string }[];
  gates: { ok: boolean; detail: string };
  pr: boolean;
  /** The fold's ⚠ lines (step `wiki acks`): the pending acks it could not keep, said again when prepare stops. */
  folded?: readonly string[];
}) {
  if (!o.todos.length && o.gates.ok) return undefined;
  const why = [
    o.todos.length ? `${o.todos.length} ${TODO} left` : '',
    o.gates.ok ? '' : "the docs' human gates",
  ].filter(Boolean);
  const out = [
    `✖  ${why.join(' and ')} would fail the release pull request's CI: nothing is pushed, ${o.branch} is committed here.`,
  ];
  if (o.todos.length)
    out.push(
      '',
      `The prose to write, one ${TODO} each (file:line, then the line, the brief):`,
      ...o.todos.map((t) => `  ${t.at}\n      ${t.what}`),
      'Write it yourself, or ask your AI assistant to write it with these markers as the brief; read the diff.',
      'The upgrade notes (en, fr) are a translation pair: record it as npm run wiki -- check prints.',
    );
  if (!o.gates.ok)
    out.push(
      '',
      'The reviews to record:',
      o.gates.detail.replace(/^/gm, '  '),
      'A person reads each one and types its command (prepare never records a review).',
    );
  if (o.folded?.length)
    out.push(
      '',
      'The pending acks the fold could not keep (their text changed since they were read):',
      ...o.folded.map((l) => `  ${l}`),
      "A person's review among them is read again by a person before its command is typed.",
    );
  out.push(
    '',
    `Commit on ${o.branch}, then run the same command:`,
    `  npm run release -- prepare ${o.version} --name="${o.name}"${o.pr ? '' : ' --no-pr'}`,
    `It resumes here, then ${o.pr ? 'pushes and opens the pull request' : 'stops (--no-pr)'}, its CI run once.`,
  );
  return out.join('\n');
}

/**
 * The warm-up of main's mutation cache (4.5.5): the nightly's mutation jobs only (#330, `-f jobs=mutation`), on the
 * organisation's main. A release commit moves only version fields, which the input hashes leave out, so main's hashes
 * are the release commit's: started when the pull request is pushed, it fills the cache while the pull request is in
 * review, and the candidate its merge starts reuses it.
 */
export const warmupArgs = (repo: string) => [
  'workflow',
  'run',
  'nightly',
  '--repo',
  repo,
  '--ref',
  'main',
  '-f',
  'jobs=mutation',
];
export const warmupCommand = (repo: string) => `gh ${warmupArgs(repo).join(' ')}`;

/** Starts the warm-up through `run` (gh); never throws: a refusal is a warning with the command to run by hand. */
export function startWarmup(run: Run, repo: string): { ok: boolean; url: string; say: string } {
  const workflow = `https://github.com/${repo}/actions/workflows/nightly.yml`;
  let r: { code: number; out: string };
  try {
    r = run('gh', warmupArgs(repo));
  } catch (e) {
    r = { code: 1, out: (e as Error).message };
  }
  if (r.code !== 0) {
    const why = r.out.trim().split('\n').filter(Boolean).at(-1) ?? `gh exited ${r.code}`;
    return {
      ok: false,
      url: workflow,
      say: `⚠  the mutation cache's warm-up did not start (${why}); the candidate will measure every changed set. Run it by hand:\n  ${warmupCommand(repo)}`,
    };
  }
  const url =
    new RegExp(`https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/actions/runs/\\d+`).exec(
      r.out,
    )?.[0] ?? workflow;
  return { ok: true, url, say: `✔  the mutation cache's warm-up started on main (nightly, jobs=mutation): ${url}` };
}

/** The pull request body's line about the warm-up. */
export const warmupBodyLine = (w: { ok: boolean; url: string }, repo: string) =>
  w.ok
    ? `\`prepare\` started the warm-up of main's mutation cache (the nightly's mutation jobs, ${w.url}): the candidate this merge starts reuses it for every set whose inputs did not move.`
    : `The warm-up of main's mutation cache did not start; run it while this pull request is in review, so the candidate its merge starts reuses it: \`${warmupCommand(repo)}\`.`;

/** What `--no-pr` says: nothing pushed, nothing started, and the warm-up's command for when the pull request opens. */
export const noPrNote = (repo: string) =>
  `--no-pr: nothing pushed, no warm-up started. Once you open the pull request, warm main's mutation cache for its candidate:\n  ${warmupCommand(repo)}`;

/** The steps of `prepare`, in 4.5.3's order; before the push, the prose left and the human gates (4.5.5). */
export const PREPARE_STEPS = [
  'branch',
  'version',
  'changelog',
  'wiki acks',
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
] as const;

/** The steps of a run again on a prepared branch. */
export const RESUME_STEPS = [
  'before the push',
  'pull request',
] as const satisfies readonly (typeof PREPARE_STEPS)[number][];

interface CheckDeps {
  read: (file: string) => string;
  /** The files a release writes prose into. */
  todoFiles: () => string[];
  /** Runs a command: its exit code and what it printed. */
  run: Run;
}

/** The reference golden save of `version`: its entry in tests/fixtures/saves/index.json and its file (#348). */
function goldenSave(version: string, read: (file: string) => string) {
  let demo: unknown;
  try {
    demo = (JSON.parse(read('tests/fixtures/saves/index.json') || '{}') as { demo?: unknown }).demo;
  } catch {
    return { ok: false, detail: 'tests/fixtures/saves/index.json is not JSON' };
  }
  if (!Array.isArray(demo) || !demo.includes(version))
    return {
      ok: false,
      detail: `${version} is not in tests/fixtures/saves/index.json: npx tsx tools/golden-save.ts ${version}, then add it to "demo"`,
    };
  if (!read(`tests/fixtures/saves/demo-${version}.json`).trim())
    return {
      ok: false,
      detail: `no tests/fixtures/saves/demo-${version}.json: npx tsx tools/golden-save.ts ${version}`,
    };
  return { ok: true, detail: '' };
}

/** What `check` says of a prepared release, item by item. */
export async function checkRelease(version: string, deps: CheckDeps) {
  const pkg = JSON.parse(deps.read('package.json') || '{}') as { version?: string };
  const todos = todoMarkers(deps.todoFiles().map((path) => ({ path, text: deps.read(path) })));
  const wiki = deps.run('npm', ['run', '-s', 'wiki', '--', 'check']);
  const gates = humanGates(deps.run);
  return [
    { what: `package.json is at ${version}`, ok: pkg.version === version, detail: `it is at ${pkg.version}` },
    {
      what: `CHANGELOG.md has a ${version} section`,
      ok: releaseNotes(deps.read('CHANGELOG.md'), `v${version}`) !== null,
      detail: `no "## ${version}" heading`,
    },
    {
      // #348: prepare writes both; a release branch made or edited by hand could lose them.
      what: `the passes sheet docs/dev/passes/${version}.md`,
      ok: deps.read(`docs/dev/passes/${version}.md`).trim() !== '',
      detail: `no docs/dev/passes/${version}.md: npm run release -- prepare writes it from the previous one`,
    },
    { what: `the golden save of ${version} (tests/fixtures/saves)`, ...goldenSave(version, deps.read) },
    { what: `no ${TODO} left`, ok: todos.length === 0, detail: todos.join(', ') },
    {
      what: 'npm run wiki -- check: no warning',
      ok: wiki.code === 0 && /\b0 warning\(s\)/.test(wiki.out),
      detail: 'see npm run wiki -- check',
    },
    {
      // What docs-publish would refuse but "executed" (the candidate's report checks it): a claim or a pair a person
      // must read fails the release pull request, never the release (4.5.4).
      what: "the docs' human gates (wiki -- check --publish --reviews-only)",
      ...gates,
    },
    {
      what: 'npm run quality:baseline -- --check',
      ok: deps.run('npm', ['run', '-s', 'quality:baseline', '--', '--check']).code === 0,
      detail: 'see npm run quality:baseline -- --check',
    },
  ];
}

// ——— The command line. Everything below runs in the repository's root, the commands 4.5.3's release ran by hand.

let root: string | undefined;
const ROOT_ = () => (root ??= execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT_(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
const capture = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: ROOT_(), encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const file = (f: string) => join(ROOT_(), f);
const read = (f: string) => (existsSync(file(f)) ? readFileSync(file(f), 'utf8') : '');
const say = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`);
/** Today, the local day (as tools/changes.ts dates the fragments). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

/**
 * The bullets of `version`'s CHANGELOG section, to start the upgrade notes from: each top-level bullet whole, with its
 * continuation lines, a nested list and an indented paragraph as written (#333: 4.5.4's were cut to their first line).
 * The headings, the intro and the blank lines between bullets are left out: the page gets one tight list.
 */
export function changelogBullets(changelog: string, version: string) {
  const notes = releaseNotes(changelog, `v${version}`) ?? '';
  const bullets: string[][] = [];
  let open = false;
  for (const line of notes.split('\n')) {
    if (/^[-*+] /.test(line)) {
      bullets.push([line]);
      open = true;
    } else if (open && (line.trim() === '' || /^\s/.test(line))) bullets.at(-1)!.push(line);
    else open = false;
  }
  return bullets.map((b) => b.join('\n').trimEnd());
}

/** What to do when a step failed: finish by hand after the commit, else undo the branch (nothing was pushed). */
export function wayBack(step: string, version: string, branch: string, target?: { remote: string; head: string }) {
  if (step === 'pull request')
    return [
      'The release commit is made; push it and open the pull request by hand:',
      `  git push -u ${target?.remote ?? '<the fork>'} ${branch}`,
      `  gh pr create --repo ${REPO} --base main --head ${target?.head ?? ''}${branch} --title "${version}: the release"`,
    ].join('\n');
  return [
    'Nothing was pushed. To start again from main:',
    '  git reset --hard && git clean -fd -- changes docs tests wiki',
    `  git switch main && git branch -D ${branch}`,
  ].join('\n');
}

function prepare(version: string, opts: { name: string; date: string; pr: boolean; dryRun: boolean }) {
  const current = JSON.parse(read('package.json')).version as string;
  let remote: string | undefined;
  try {
    remote = releaseRemote();
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
  }
  const fetched = remote
    ? spawnSync('git', ['fetch', '--quiet', remote, 'main'], { cwd: ROOT_() }).status === 0
    : false;
  if (remote && !fetched) console.error(`✖  git fetch ${remote} main failed: main's state there is not known`);
  const head = sh('git', ['rev-parse', 'HEAD']);
  const theirs = remote
    ? spawnSync('git', ['rev-parse', '-q', '--verify', `${remote}/main`], {
        cwd: ROOT_(),
        encoding: 'utf8',
      }).stdout.trim()
    : '';
  const target = pushTarget(sh('git', ['remote', '-v']), REPO);
  let pr: string | undefined;
  if (opts.pr) {
    if ('problem' in target) pr = target.problem;
    else if (spawnSync('gh', ['auth', 'status'], { cwd: ROOT_(), stdio: 'ignore' }).status !== 0)
      pr = 'gh is not signed in (gh auth login), or pass --no-pr and open the pull request by hand';
  }
  const dirty = sh('git', ['status', '--porcelain']) !== '';
  const onBranch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const shallow = sh('git', ['rev-parse', '--is-shallow-repository']) === 'true';
  // Run again on its branch (the stop before the push held it), prepare resumes there: the commits over main say whether
  // it is the branch prepare made.
  const subjects = () => {
    const r = spawnSync('git', ['log', '--format=%s', `${theirs || 'main'}..HEAD`], { cwd: ROOT_(), encoding: 'utf8' });
    return r.status === 0 ? r.stdout : '';
  };
  const resuming = resumeRefusals({
    current,
    version,
    branch: onBranch,
    dirty,
    prepared: onBranch === `release/${version}` && isPrepared(subjects(), version),
    shallow,
    pr,
  });
  const resume = resuming !== undefined;
  const refusals =
    resuming ??
    prepareRefusals({
      current,
      version,
      dirty,
      branch: onBranch,
      shallow,
      upToDate: fetched && head === theirs,
      upgradeNotes: existsSync(file(`wiki/en/${upgradeNotesPage(version)}.md`)),
      fragments: fragmentFiles(readdirSync(file('changes'))).length,
      pr,
      name: opts.name,
      passes: (() => {
        const sheet = newestSheet();
        return sheet
          ? passesSheetProblem(read(`docs/dev/passes/${sheet}.md`), sheet)
          : 'docs/dev/passes holds no sheet';
      })(),
    });
  // A resume says the name again in the command it prints: refused the same (#348).
  const nameProblem = releaseNameProblem(opts.name);
  if (resume && nameProblem) refusals.push(nameProblem);
  if (refusals.length) {
    for (const r of refusals) console.error(`✖  ${r}`);
    if (!opts.dryRun) process.exit(1);
  }
  if (nameProblem) process.exit(1); // said above, even on a dry run
  // On a resume package.json is at the version already; the previous one is only used by the steps it skips.
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
    // The branches' pending acks into wiki/translations.json and wiki/reviews.json, as the fragments into the CHANGELOG
    // (#360); what no longer holds its text is printed, and kept for the stop before the push.
    'wiki acks': () => {
      const r = capture('npm', ['run', '-s', 'wiki', '--', 'acks', '--fold']);
      if (r.code !== 0) throw new Error(r.out.trim());
      for (const line of r.out.trim().split('\n')) say(line);
      mkdirSync(file('.cache/release'), { recursive: true });
      writeFileSync(
        file(foldedFile(version)),
        r.out
          .split('\n')
          .filter((l) => l.startsWith('⚠'))
          .join('\n'),
      );
    },
    'upgrade notes': () => {
      const bullets = changelogBullets(read('CHANGELOG.md'), version);
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
      sh('git', ['commit', '-q', '-m', preparedSubject(version)]);
    },
    'before the push': () => {
      // The same markers and gates `check` (the pull request's CI) fails on: what is left, said in one stop.
      const todos = todoBrief(todoFiles(version).map((path) => ({ path, text: read(path) })));
      const folded = read(foldedFile(version)).split('\n').filter(Boolean);
      const stop = beforePushStop({
        version,
        name: opts.name,
        branch,
        todos,
        gates: humanGates(capture),
        pr: opts.pr,
        folded,
      });
      if (!stop) return;
      console.error(stop);
      process.exit(1);
    },
    'pull request': () => {
      if (!opts.pr) return say(noPrNote(REPO));
      if ('problem' in target) throw new Error(target.problem);
      sh('git', ['push', '-q', '-u', target.remote, branch]);
      // Pushed: the warm-up of main's mutation cache, while the pull request is in review (4.5.5). Never fatal.
      const warmup = startWarmup(capture, REPO);
      say(warmup.say);
      const body = [
        `## What changes`,
        '',
        `Release ${version} "${opts.name}", prepared by \`npm run release -- prepare\`: version, CHANGELOG and LOG from the fragments, the pending acks folded, transition pages, golden save, reference run, passes sheet and passIssues, README, quality baseline.`,
        '',
        `Its prose is written and its docs' human gates hold: \`prepare\` pushes only then. \`npm run release -- check ${version}\` is this pull request's CI.`,
        '',
        warmupBodyLine(warmup, REPO),
      ].join('\n');
      const head = `${target.head}${branch}`;
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
  if (resume) say(`${branch} is prepared: resuming before the push (the prose left, the human gates)`);
  for (const name of resume ? RESUME_STEPS : PREPARE_STEPS) {
    if (opts.dryRun) {
      say(`would run: ${name}`);
      continue;
    }
    say(`${name}…`);
    try {
      steps[name]();
    } catch (e) {
      console.error(`✖  ${name}: ${(e as Error).message}`);
      console.error(wayBack(name, version, branch, 'remote' in target ? target : undefined));
      process.exit(1);
    }
  }
  if (opts.dryRun) process.exit(refusals.length ? 1 : 0);
  say(`✔  ${branch} prepared: npm run release -- check ${version} says what is left`);
}

async function check(version: string) {
  const items = await checkRelease(version, { read, todoFiles: () => todoFiles(version), run: capture });
  for (const i of items)
    console.log(`${i.ok ? '✔' : '✖'}  ${i.what}${i.ok ? '' : `:\n${i.detail.replace(/^/gm, '     ')}`}`);
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
  else if (verb && /^\d+\.\d+\.\d+$/.test(verb)) {
    // The release itself, after the release pull request's merge (4.5.4, part D): tools/release/release-run.ts.
    const { runRelease } = await import('./release-run');
    const all = process.argv.slice(3);
    const key = all.find((a) => a.startsWith('--key='))?.slice(6);
    try {
      await runRelease(verb, {
        ...(key ? { key } : {}),
        startCandidate: all.includes('--start-candidate'),
        docsRevision: all.includes('--docs-revision'),
        dryRun: all.includes('--dry-run'),
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    console.error(
      'usage: npm run release -- <x.y.z> [--key=<key.pub>] [--start-candidate] [--docs-revision] [--reverify] [--dry-run] | prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run] | check <x.y.z>',
    );
    process.exit(2);
  }
}
