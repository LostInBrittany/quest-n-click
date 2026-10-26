// npm run release -- <x.y.z> [--key=<ssh public key>] [--start-candidate] [--docs-revision] [--reverify] [--commit=<sha>] [--dry-run]
// (4.5.6) --commit=<sha> releases on a later commit of main than the release merge, when the merge's own ci is red for a
// reason fixed after it (4.5.5: its windows job, fixed by #368): main-ci.mjs wants main's ci green on the tagged SHA.
// That commit stands for the release commit everywhere (gates, candidate, tag, release run); commitRefusals says
// which it may be: on main's first-parent line, package.json at the version, the release merge or after it.
// (4.5.5, #348) The candidate wait re-runs once by the run's attempt number (a relaunch keeps the budget), re-runs a run
// cancelled before any job failed whole, and stops after 3 h an attempt, saying how to resume (candidateStep). Run end to
// end by tests/release-command.test.ts, its waits on lib.mjs's clock.
// (4.5.5, #343) A resumed run skips `ship verify` when it passed for exactly this release (verifyOnce, below);
// --reverify runs it anyway.
// (4.5.5, #339) Its preflight also checks the docs' human gates on the release commit's own tree (a temporary
// worktree of it: main may be ahead), before the candidate is waited for: a claim merged after the release pull
// request's CI ran is caught there, not by docs-publish after the tag. That tree can no longer take a review, so the
// stop says the one way on, --docs-revision: the release and npm as usual, the docs as a revision from docs/<v>.
// (4.5.4, part D of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) The maintainer's one command after the release pull
// request's merge, on main: it refuses first what would fail later (not the merged release, uncommitted changes, no
// CHANGELOG section, no SSH signing key or one not in allowed_signers, gh or npm not signed in, npm too old, an npm
// user who is not an owner); finds the release commit (where package.json became the version on main, or the tag's
// commit once pushed: what is merged after it does not move it) and the candidate the merge started on it (or starts
// one, --start-candidate), and waits for it, saying where it is, re-running its failed jobs once; then `ship tag …
// --sign --no-watch` (main's ci, the signed tag pushed to the organisation's repository); then it follows the release
// run job by job until `release` and `npm-stage` have succeeded (the documentation's jobs said, never waited on: a docs
// problem never holds back npm), verifies the release's files (`ship verify`), approves the npm packages the release
// staged, one by one with the maintainer's 2FA, the engine first; then one summary. Run again after a stop, it goes on
// where it stopped: a green candidate is not waited for again, a tag already pushed is followed, a package already
// published is not approved again.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseNotes } from '../../scripts/release-notes.mjs';
import { humanGates } from './gates';
// @ts-expect-error: a plain .mjs module without declarations
import { clock, REPO, releaseRemote, sleep } from './lib.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { MINIMUM, NPM_NAMES, OWNERS } from './preflight.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

/** The packages a release stages, the engine first (create depends on its exact version): preflight.mjs's list. */
const PACKAGES: readonly string[] = NPM_NAMES;

/** The steps, in the order a release takes. */
export const RELEASE_STEPS = ['preflight', 'candidate', 'tag and release', 'npm', 'summary'] as const;

const atLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split('.').map(Number)) as [number[], number[]];
  return (a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!) >= 0;
};

/** The command to run again, `--commit` kept when it was given. */
export const releaseCommand = (version: string, commit?: string) =>
  `npm run release -- ${version}${commit ? ` --commit=${commit}` : ''}`;

/**
 * What `--commit=<sha>` refuses (4.5.6), each with what to do: it must name a commit this checkout knows (`resolved`,
 * its full SHA), on main's first-parent line, where package.json is the version, the release merge `found` or one after
 * it (`descends`); once the tag is out (`tagged`, its commit), only that commit.
 */
export function commitRefusals(o: {
  version: string;
  given: string;
  resolved: string | undefined;
  firstParent: boolean;
  versionAt: string | undefined;
  found: string | undefined;
  descends: boolean;
  tagged: string | undefined;
}): string[] {
  if (!/^[0-9a-f]{7,40}$/i.test(o.given) || !o.resolved)
    return [
      `--commit=${o.given} is not a commit SHA this checkout knows: give main's commit by its SHA (git fetch the organisation's remote first)`,
    ];
  const s = o.resolved.slice(0, 7);
  if (o.tagged && o.tagged !== o.resolved)
    return [
      `v${o.version} is tagged on ${o.tagged.slice(0, 7)} already, not ${s}: a tag never moves; run ${releaseCommand(o.version)} without --commit, it follows the tag`,
    ];
  const out: string[] = [];
  if (!o.firstParent)
    out.push(
      `${s} is not on main's first-parent line: --commit takes a merge into main (git log --first-parent --oneline <remote>/main)`,
    );
  if (o.versionAt !== o.version)
    out.push(
      `package.json is at ${o.versionAt || 'no version'} on ${s}, not ${o.version}: --commit takes the release merge or a later commit of main still at ${o.version}`,
    );
  if (o.found && !o.descends)
    out.push(
      `${s} does not come after the release merge ${o.found.slice(0, 7)}: --commit takes the release merge or a later commit of main`,
    );
  return out;
}

/** The line that names the commit released, and says so when `--commit` put another than the release merge. */
export const commitLine = (found: string | undefined, used: string) =>
  `release commit ${used.slice(0, 7)}${found && found !== used ? ` (--commit: a later commit of main, not the release merge ${found.slice(0, 7)})` : ''}`;

/** What the command refuses before it does anything, each with what to do. */
export function releaseRefusals(o: {
  version: string;
  current: string;
  branch: string;
  dirty: boolean;
  upToDate: boolean;
  section: boolean;
  signing: boolean;
  gh: boolean;
  npm: string | undefined;
  owners: readonly string[];
  /** `npm --version`: `npm stage` needs MINIMUM.npm. */
  npmVersion: string;
  /** The signing key is named in .github/allowed_signers (the tag's signature is judged against it). */
  signer: boolean;
}): string[] {
  const out: string[] = [];
  if (o.current !== o.version)
    out.push(
      `package.json is at ${o.current}, not ${o.version}: merge the release pull request (npm run release -- prepare ${o.version}) first`,
    );
  if (o.branch !== 'main') out.push(`the checkout is on ${o.branch}: a release is made on main (git switch main)`);
  if (o.dirty) out.push('the checkout has uncommitted changes: commit or set them aside first');
  if (!o.upToDate) out.push("main is not the organisation's: git pull first");
  if (!o.section) out.push(`CHANGELOG.md has no "## ${o.version}" section: the release pull request writes it`);
  if (!o.signing)
    out.push(
      'no SSH signing key: git config gpg.format ssh and git config user.signingkey <key.pub> (or --key=<key.pub>)',
    );
  else if (!o.signer)
    out.push(
      'the signing key is not named in .github/allowed_signers: add it in a commit signed by a key already there',
    );
  if (!o.gh) out.push('gh is not signed in: gh auth login');
  if (!o.npm) out.push('npm is not signed in: npm login (the approvals need an owner of the organisation, with 2FA)');
  else if (!o.owners.includes(o.npm))
    out.push(`npm user ${o.npm} is not an owner of the quest-n-click organisation (${o.owners.join(', ')})`);
  if (!atLeast(o.npmVersion, MINIMUM.npm))
    out.push(`npm ${o.npmVersion}: npm stage needs ${MINIMUM.npm} or later (npm install -g npm)`);
  return out;
}

interface Run {
  databaseId: number;
  event: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion: string;
  createdAt: string;
}

/** The runs of `sha` started on main (a release's merge, or by hand), newest first: the candidate is among them. */
function candidateRuns(runs: readonly Run[], sha: string): Run[] {
  return [...runs]
    .filter((r) => r.headSha === sha && r.headBranch === 'main' && ['push', 'workflow_dispatch'].includes(r.event))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The newest of them; `isCandidateRun` on its jobs says whether it is one (a push that was no release is not). */
export const pickCandidate = (runs: readonly Run[], sha: string): Run | undefined => candidateRuns(runs, sha)[0];

interface Job {
  name: string;
  status: string;
  conclusion: string;
}

/** A run is a candidate when its `target` ran: on a push that was no release, release-merge skips it and every job. */
export const isCandidateRun = (jobs: readonly Job[]) =>
  jobs.some((j) => j.name === 'target' && !(j.status === 'completed' && j.conclusion === 'skipped'));

/**
 * The release commit: where package.json became `version` on main. `history` is package.json's version at each commit
 * that touched it, newest first; the commits merged after the release keep the version, the one before it does not.
 */
export function releaseCommit(
  history: readonly { sha: string; version: string }[],
  version: string,
): string | undefined {
  let found: string | undefined;
  for (const h of history) {
    if (h.version !== version) break;
    found = h.sha;
  }
  return found;
}

/** The steps of a docs revision of `version` (docs-publish.yml publishes one from `docs/<v>` only, cut from the tag). */
export const docsRevisionSteps = (version: string) => [
  `git switch -c docs/${version} v${version}`,
  'record each review above (its command), commit',
  `git push <the organisation's remote> docs/${version}`,
  `gh workflow run docs-publish --ref docs/${version} -f mode=revision -f version=${version}`,
];

/**
 * The stop when the docs' human gates fail on the release commit (#339), or nothing: they pass, or `--docs-revision`
 * said to go on. The tag is pinned to that commit, whose tree can no longer take a review, so the docs follow as a
 * revision; npm is never held back by the docs.
 */
export function docsGatesStop(o: {
  version: string;
  sha: string;
  gates: { ok: boolean; detail: string };
  docsRevision: boolean;
  /** `--commit`, kept in the command it says to run. */
  commit?: string;
}): string | undefined {
  if (o.gates.ok || o.docsRevision) return undefined;
  return [
    `the docs' human gates fail on the release commit ${o.sha.slice(0, 7)} (merged after the release pull request's CI checked them): nothing is tagged.`,
    o.gates.detail.replace(/^/gm, '    '),
    `  The tag goes on ${o.sha.slice(0, 7)}, whose tree can no longer take a review, so the release's docs-publish would refuse its docs.`,
    `  To release now, npm as usual and the docs as a revision after: ${releaseCommand(o.version, o.commit)} --docs-revision`,
    '  then, once the release is out:',
    ...docsRevisionSteps(o.version).map((s) => `    ${s}`),
  ].join('\n');
}

/** One line for a wait: jobs done out of all, those running, those waiting, those failed. */
export function candidateProgress(jobs: readonly Job[]): string {
  const done = jobs.filter((j) => j.status === 'completed');
  const running = jobs.filter((j) => j.status === 'in_progress').map((j) => j.name);
  const waiting = jobs.filter((j) => j.status !== 'completed' && j.status !== 'in_progress').length;
  const failed = done.filter((j) => ['failure', 'cancelled', 'timed_out'].includes(j.conclusion)).map((j) => j.name);
  return [
    `${done.length}/${jobs.length} jobs done`,
    ...(running.length ? [`running: ${running.join(', ')}`] : []),
    ...(waiting ? [`waiting: ${waiting}`] : []),
    ...(failed.length ? [`failed: ${failed.join(', ')}`] : []),
  ].join(' · ');
}

/** How long the command waits for a candidate attempt before it stops (#348): about twice its 90 minutes. */
export const CANDIDATE_DEADLINE_MS = 180 * 60_000;

interface CandidateView {
  status: string;
  conclusion: string;
  /** The run's attempt (`gh run view --json attempt`): 2 once it was re-run, by this command or anyone. */
  attempt?: number;
  jobs: readonly Job[];
}

/**
 * What the wait does with a view of the candidate (#348). Green: done. Failed or cancelled on its first attempt: re-run
 * once, its failed jobs, or the whole run when none failed (cancelled before any did). Failed on a later attempt: stop,
 * whoever re-ran it, so a relaunch never spends a second re-run. Asked to re-run while GitHub still shows the old
 * attempt: wait. Still going after the deadline: stop, saying where it is and how to resume.
 */
export function candidateStep(
  view: CandidateView,
  o: { id: number; version: string; rerunAsked: boolean; waitedMs: number; commit?: string },
): { do: 'done' } | { do: 'wait' } | { do: 'rerun'; args: string[]; line: string } | { do: 'stop'; error: string } {
  const url = `https://github.com/${REPO}/actions/runs/${o.id}`;
  if (view.status !== 'completed') {
    if (o.waitedMs < CANDIDATE_DEADLINE_MS) return { do: 'wait' };
    return {
      do: 'stop',
      error: `candidate run ${o.id} not done after ${Math.round(o.waitedMs / 60_000)} min (${candidateProgress(view.jobs)}): it goes on on GitHub (${url}); run ${releaseCommand(o.version, o.commit)} again to resume, it picks the run up where it is`,
    };
  }
  if (view.conclusion === 'success') return { do: 'done' };
  const failed = view.jobs
    .filter((j) => j.status === 'completed' && !['success', 'skipped'].includes(j.conclusion))
    .map((j) => `${j.name} ${j.conclusion}`);
  const attempt = view.attempt ?? 1;
  if (attempt > 1)
    return {
      do: 'stop',
      error: `candidate run ${o.id} ${view.conclusion === 'failure' ? 'failed' : view.conclusion} again (attempt ${attempt}): ${failed.join(', ') || 'no job failed'} (${url}). It was re-run once already: fix what failed, then re-run it by hand (gh run rerun ${o.id} --repo ${REPO} --failed) and run ${releaseCommand(o.version, o.commit)} again`,
    };
  if (o.rerunAsked) return { do: 'wait' };
  const args = ['run', 'rerun', String(o.id), '--repo', REPO];
  if (failed.length)
    return {
      do: 'rerun',
      args: [...args, '--failed'],
      line: `candidate ${view.conclusion} (${failed.join(', ')}): re-running its failed jobs once`,
    };
  return {
    do: 'rerun',
    args,
    line: `candidate ${view.conclusion} before any job failed: re-running the whole run once`,
  };
}

/**
 * The release run, as the command needs it: npm waits for `release` and `npm-stage`, nothing else. The documentation's
 * jobs are said apart: a docs problem never holds back npm (part E), a docs revision fixes it.
 */
export function releaseRunVerdict(
  jobs: readonly Job[],
): { state: 'waiting' | 'ready'; warnings: string[] } | { state: 'failed'; warnings: string[]; failed: string[] } {
  const needed = jobs.filter((j) => j.name === 'release' || j.name === 'npm-stage');
  const warnings = jobs
    .filter((j) => !needed.includes(j) && j.status === 'completed' && j.conclusion !== 'success')
    .map((j) => `${j.name}: ${j.conclusion}`);
  const failed = needed
    .filter((j) => j.status === 'completed' && j.conclusion !== 'success')
    .map((j) => `${j.name}: ${j.conclusion}`);
  if (failed.length) return { state: 'failed', warnings, failed };
  if (needed.length === 2 && needed.every((j) => j.status === 'completed')) return { state: 'ready', warnings };
  return { state: 'waiting', warnings };
}

/** `npm stage list --json` (npm 11: an array of `{id, packageName, version, …}`), this version's, the engine first. */
export function stagedFromJson(json: string, version: string): { id: string; name: string }[] {
  const items = JSON.parse(json || '[]') as { id: string; packageName: string; version: string }[];
  return items
    .filter((i) => i.version === version)
    .sort((a, b) => PACKAGES.indexOf(a.packageName) - PACKAGES.indexOf(b.packageName))
    .map((i) => ({ id: i.id, name: i.packageName }));
}

/** What a passed `ship verify` vouched for (#343): the tag object, its commit, the release and each asset's digest. */
export interface VerifiedState {
  tag: string;
  commit: string;
  release: number;
  immutable: boolean;
  assets: { name: string; digest: string | null }[];
}

/**
 * The state of `v<version>` from `gh api repos/<repo>/releases/tags/v<version>` and `git ls-remote --tags <remote>
 * refs/tags/v<version> refs/tags/v<version>^{}` (the tag object, then its commit), the assets sorted by name.
 */
export function verifiedState(releaseJson: string, lsRemote: string, version: string): VerifiedState {
  const r = JSON.parse(releaseJson || '{}') as {
    id?: number;
    immutable?: boolean;
    assets?: { name: string; digest?: string | null }[];
  };
  const ref = (name: string) =>
    lsRemote
      .split('\n')
      .map((l) => l.split('\t'))
      .find(([, n]) => n === name)?.[0] ?? '';
  return {
    tag: ref(`refs/tags/v${version}`),
    commit: ref(`refs/tags/v${version}^{}`),
    release: r.id ?? 0,
    immutable: r.immutable === true,
    assets: (r.assets ?? [])
      .map((a) => ({ name: a.name, digest: a.digest ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Whether a resumed run may skip `ship verify` (#343), and the line that says so or why not. Only when a passed
 * verify recorded exactly this state: the same tag object and commit, the same release, the same assets with the same
 * digests, every one with a digest, the release immutable (its assets and tag can no longer change), and no --reverify.
 */
export function verifySkip(
  record: (VerifiedState & { at: string }) | undefined,
  now: VerifiedState,
  force: boolean,
): { skip: boolean; line: string } {
  const again = (why: string) => ({ skip: false, line: `verify: ${why}: ship verify runs` });
  if (force) return again('--reverify');
  if (!record) return again('no record of a passed verify');
  if (!now.tag || !now.commit) return again('the tag is not on the remote');
  if (record.tag !== now.tag || record.commit !== now.commit) return again('the tag moved since it passed');
  if (record.release !== now.release) return again('the release is not the one verified');
  if (!now.immutable) return again('the release is not immutable');
  if (!now.assets.length || now.assets.some((a) => !a.digest)) return again('an asset has no digest');
  const key = (s: VerifiedState) => JSON.stringify(s.assets);
  if (key(record) !== key(now)) return again('the assets changed since it passed');
  return {
    skip: true,
    line: `verify: already passed at ${record.at} for tag ${now.tag.slice(0, 12)}, release ${now.release}, ${now.assets.length} assets unchanged – skipped (--reverify to run it again)`,
  };
}

// ——— The command line. Everything below runs in the repository's root.

let root: string | undefined;
const ROOT = () => (root ??= execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const sh = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: ROOT(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: ROOT(), encoding: 'utf8' });
  return { code: r.status ?? 1, out: (r.stdout ?? '').trim() };
};
const loud = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: ROOT(), stdio: 'inherit' }).status ?? 1;
const say = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`);
const MINUTE = 60_000;
const home = (p: string) => p.replace(/^~(?=\/)/, process.env.HOME ?? '~');

/** A gh call that a passing GitHub error (a 502, a reset) does not end: retried for about five minutes. */
async function ghJson<T>(args: string[]): Promise<T> {
  for (let i = 0; ; i++) {
    const r = quiet('gh', args);
    if (r.code === 0) return JSON.parse(r.out || 'null') as T;
    if (i >= 10) throw new Error(`gh ${args.slice(0, 2).join(' ')} keeps failing: run the command again later`);
    await sleep(30_000);
  }
}

/** The SSH public key git signs with (`--key`, else user.signingkey): its text, or undefined. */
function signingKey(key: string | undefined): string | undefined {
  const path = key ? home(key) : quiet('git', ['config', 'user.signingkey']).out;
  if (!path) return undefined;
  if (path.startsWith('key::')) return path.slice(5).trim();
  const file = home(path);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined;
}

const signingReady = (key: string | undefined) =>
  (!!key || quiet('git', ['config', 'gpg.format']).out === 'ssh') && !!signingKey(key);

function namedSigner(key: string | undefined) {
  const pub = signingKey(key)?.split(/\s+/).slice(0, 2).join(' ');
  const file = join(ROOT(), '.github/allowed_signers');
  return !!pub && existsSync(file) && readFileSync(file, 'utf8').includes(pub);
}

/** The release commit: the tag's commit once it is pushed, else where package.json became the version on main (first parents only: the merged release branch's own commits are not main's). */
function findReleaseCommit(remote: string, version: string): string | undefined {
  const tagged = quiet('git', ['ls-remote', '--tags', remote, `refs/tags/v${version}^{}`]).out.split(/\s/)[0];
  if (tagged) return tagged;
  const shas = quiet('git', [
    'log',
    '--first-parent',
    '--format=%H',
    '-n',
    '50',
    `${remote}/main`,
    '--',
    'package.json',
  ])
    .out.split('\n')
    .filter(Boolean);
  const history: { sha: string; version: string }[] = [];
  for (const sha of shas) {
    const v = (JSON.parse(quiet('git', ['show', `${sha}:package.json`]).out || '{}') as { version?: string }).version;
    history.push({ sha, version: v ?? '' });
    if (v !== version) break;
  }
  return releaseCommit(history, version);
}

async function waitForCandidate(sha: string, version: string, startIt: boolean, commit?: string): Promise<number> {
  const runsOf = () =>
    ghJson<Run[]>([
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      'candidate.yml',
      '--commit',
      sha,
      '--json',
      'databaseId,event,headBranch,headSha,status,conclusion,createdAt',
    ]);
  const viewOf = (id: number) =>
    ghJson<CandidateView & { jobs: Job[] }>([
      'run',
      'view',
      String(id),
      '--repo',
      REPO,
      '--json',
      'status,conclusion,jobs,attempt',
    ]);
  const find = async () => {
    for (const r of candidateRuns(await runsOf(), sha)) if (isCandidateRun((await viewOf(r.databaseId)).jobs)) return r;
    return undefined;
  };
  let run = await find();
  if (!run && startIt) {
    say(`no candidate of ${sha.slice(0, 7)} on main: starting one`);
    sh('gh', ['workflow', 'run', 'candidate.yml', '--repo', REPO, '--ref', 'main', '-f', `sha=${sha}`]);
    for (let i = 0; i < 20 && !run; i++) {
      await sleep(15_000);
      run = await find();
    }
  }
  if (!run)
    throw new Error(
      `no candidate of ${sha.slice(0, 7)} on main: the release pull request's merge starts one; or run again with --start-candidate`,
    );
  say(
    `candidate run ${run.databaseId} (${run.event}, about 90 min, given up after ${CANDIDATE_DEADLINE_MS / 60 / MINUTE} h an attempt): https://github.com/${REPO}/actions/runs/${run.databaseId}`,
  );
  // The re-run budget is the run's attempt number (candidateStep), never this process's memory: a relaunch keeps it.
  let started = clock();
  let rerunAsked = false;
  let last = '';
  let said = 0;
  for (;;) {
    const view = await viewOf(run.databaseId);
    if ((view.attempt ?? 1) > 1) rerunAsked = false; // the attempt asked for is the one shown now
    const line = candidateProgress(view.jobs);
    // Each change said, and a line every five minutes anyway.
    if (line !== last || clock() - said >= 5 * MINUTE) {
      say(`candidate (${Math.round((clock() - started) / MINUTE)} min): ${line}`);
      said = clock();
    }
    last = line;
    const step = candidateStep(view, {
      id: run.databaseId,
      version,
      rerunAsked,
      waitedMs: clock() - started,
      ...(commit ? { commit } : {}),
    });
    if (step.do === 'done') return run.databaseId;
    if (step.do === 'stop') throw new Error(step.error);
    if (step.do === 'rerun') {
      say(step.line);
      sh('gh', step.args);
      rerunAsked = true;
      started = clock(); // the new attempt has its own deadline
    }
    await sleep(MINUTE);
  }
}

/** The release run of the tag, followed job by job until npm can go on; the docs' jobs said, never waited on. */
async function followRelease(sha: string, version: string, again: string): Promise<string[]> {
  const said = new Set<string>();
  for (let i = 0; ; i++) {
    const runs = await ghJson<{ databaseId: number; headSha: string; conclusion: string }[]>([
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      'release.yml',
      '--limit',
      '20',
      '--json',
      'databaseId,headSha,conclusion',
    ]);
    const run = runs.find((r) => r.headSha === sha && r.conclusion !== 'skipped');
    if (!run) {
      if (i > 20)
        throw new Error(
          `no release run of v${version} after ${i} min: https://github.com/${REPO}/actions/workflows/release.yml`,
        );
      await sleep(MINUTE);
      continue;
    }
    const view = await ghJson<{ jobs: Job[] }>([
      'run',
      'view',
      String(run.databaseId),
      '--repo',
      REPO,
      '--json',
      'jobs',
    ]);
    for (const j of view.jobs)
      if (j.status === 'completed' && !said.has(j.name)) {
        const note =
          j.name === 'npm-stage' ? ' (its npm 404s are expected: it checks the version is not on npm yet)' : '';
        say(`release run ${run.databaseId}: ${j.name} ${j.conclusion}${note}`);
        said.add(j.name);
      }
    const v = releaseRunVerdict(view.jobs);
    if (v.state === 'ready') return v.warnings;
    if (v.state === 'failed')
      throw new Error(
        `release run ${run.databaseId}: ${v.failed.join(', ')} (https://github.com/${REPO}/actions/runs/${run.databaseId}); re-run it (gh run rerun ${run.databaseId} --repo ${REPO} --failed), then ${again} again`,
      );
    await sleep(MINUTE);
  }
}

/**
 * `ship verify <version>`, once per release (#343): after it passes, the state it vouched for is recorded in
 * `.cache/release/v<version>.verified.json` (beside the download folder: inside it, ship verify would refuse an
 * unlisted file), read before and after the verify so nothing moved in between. A resumed run skips it only when
 * `verifySkip` says everything is still exactly there; `--reverify` runs it anyway. ship verify itself is unchanged.
 */
async function verifyOnce(version: string, force: boolean) {
  const file = join(ROOT(), '.cache', 'release', `v${version}.verified.json`);
  const remote = releaseRemote() as string;
  const state = () =>
    verifiedState(
      quiet('gh', ['api', `repos/${REPO}/releases/tags/v${version}`]).out,
      quiet('git', ['ls-remote', '--tags', remote, `refs/tags/v${version}`, `refs/tags/v${version}^{}`]).out,
      version,
    );
  let record: (VerifiedState & { at: string }) | undefined;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    record = undefined;
  }
  const before = state();
  const verdict = verifySkip(record, before, force);
  say(verdict.line);
  if (verdict.skip) return;
  if (loud('node', ['tools/release/ship.mjs', 'verify', version]) !== 0)
    throw new Error(`ship verify ${version} failed: the release's files do not verify (see above)`);
  const after = state();
  if (JSON.stringify(after) !== JSON.stringify(before))
    return say('verify: the release moved while it was verified: no record, the next run verifies again');
  mkdirSync(join(ROOT(), '.cache', 'release'), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...after, at: new Date().toISOString() }, null, 2)}\n`);
}

async function approveNpm(version: string) {
  const published = (p: string) => quiet('npm', ['view', `${p}@${version}`, 'version']).out === version;
  if (PACKAGES.every(published)) return say(`npm: the ${PACKAGES.length} packages are at ${version} already`);
  // npm-stage has finished (the release run says so): one read, a few retries for the registry's lag.
  let staged: { id: string; name: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const r = quiet('npm', ['stage', 'list', '--json']);
    if (r.code !== 0) throw new Error(`npm stage list failed (exit ${r.code}): npm login, then run the command again`);
    staged = stagedFromJson(r.out, version);
    const missing = PACKAGES.filter((p) => !staged.some((s) => s.name === p) && !published(p));
    if (!missing.length) break;
    if (i === 2)
      throw new Error(`neither staged nor published: ${missing.join(', ')} (the release run's npm-stage job says why)`);
    await sleep(MINUTE);
  }
  for (const s of staged) {
    say(`npm stage approve ${s.id}   # ${s.name}@${version} (your 2FA)`);
    if (loud('npm', ['stage', 'approve', s.id]) !== 0)
      throw new Error(`npm stage approve ${s.id} (${s.name}) failed: run the command again`);
  }
  // A published version can take a moment to show: two minutes before saying it is missing.
  for (let i = 0; i < 5; i++) {
    const missing = PACKAGES.filter((p) => !published(p));
    if (!missing.length) return;
    if (i === 4) throw new Error(`not on npm at ${version} yet: ${missing.join(', ')} (npm stage list)`);
    await sleep(30_000);
  }
}

/**
 * The docs' human gates on `sha`'s own tree (#339): a temporary detached worktree of it, the checkout's node_modules
 * linked, `humanGates` run there (the release pull request's check), the worktree removed whatever happens.
 */
function gatesAt(sha: string) {
  const dir = mkdtempSync(join(tmpdir(), 'qnc-release-gates-'));
  const tree = join(dir, 'tree');
  try {
    sh('git', ['worktree', 'add', '--detach', tree, sha]);
    symlinkSync(join(ROOT(), 'node_modules'), join(tree, 'node_modules'));
    return humanGates((cmd, args) => {
      const r = spawnSync(cmd, args, { cwd: tree, encoding: 'utf8' });
      return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    });
  } finally {
    quiet('git', ['worktree', 'remove', '--force', tree]);
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runRelease(
  version: string,
  opts: { key?: string; startCandidate: boolean; docsRevision: boolean; dryRun: boolean; commit?: string },
) {
  const current = JSON.parse(readFileSync(join(ROOT(), 'package.json'), 'utf8')).version as string;
  let remote: string | undefined;
  try {
    remote = releaseRemote();
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
  }
  const fetched = remote ? quiet('git', ['fetch', '--quiet', '--tags', remote, 'main']).code === 0 : false;
  if (remote && !fetched) console.error(`✖  git fetch ${remote} failed: main's state there is not known`);
  const head = sh('git', ['rev-parse', 'HEAD']);
  const theirs = remote ? quiet('git', ['rev-parse', '-q', '--verify', `${remote}/main`]).out : '';
  const npmUser = quiet('npm', ['whoami']);
  const refusals = releaseRefusals({
    version,
    current,
    branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: sh('git', ['status', '--porcelain']) !== '',
    upToDate: fetched && head === theirs,
    section: releaseNotes(readFileSync(join(ROOT(), 'CHANGELOG.md'), 'utf8'), `v${version}`) !== null,
    signing: signingReady(opts.key),
    gh: quiet('gh', ['auth', 'status', '--hostname', 'github.com']).code === 0,
    npm: npmUser.code === 0 && npmUser.out ? npmUser.out : undefined,
    owners: OWNERS,
    npmVersion: quiet('npm', ['--version']).out || '0.0.0',
    signer: namedSigner(opts.key),
  });
  const found = remote && fetched ? findReleaseCommit(remote, version) : undefined;
  if (!refusals.length && !found)
    refusals.push(`no commit of main sets package.json to ${version}: merge the release pull request first`);
  // --commit=<sha> (4.5.6): a later commit of main in place of the release merge, everywhere below.
  let sha = found;
  if (opts.commit !== undefined && remote && found) {
    const given = opts.commit;
    const resolved = /^[0-9a-f]{7,40}$/i.test(given)
      ? quiet('git', ['rev-parse', '-q', '--verify', `${given}^{commit}`]).out || undefined
      : undefined;
    const versionAt = resolved
      ? (JSON.parse(quiet('git', ['show', `${resolved}:package.json`]).out || '{}') as { version?: string }).version
      : undefined;
    const bad = commitRefusals({
      version,
      given,
      resolved,
      firstParent:
        !!resolved &&
        quiet('git', ['rev-list', '--first-parent', `${remote}/main`])
          .out.split('\n')
          .includes(resolved),
      versionAt,
      found,
      descends: !!resolved && quiet('git', ['merge-base', '--is-ancestor', found, resolved]).code === 0,
      tagged: quiet('git', ['ls-remote', '--tags', remote, `refs/tags/v${version}^{}`]).out.split(/\s/)[0] || undefined,
    });
    refusals.push(...bad);
    if (!bad.length) sha = resolved;
  }
  const commit = opts.commit !== undefined ? sha : undefined;
  // The docs' human gates on the release commit itself, before anything is waited for (#339); a tag already out is
  // past them (its docs-publish has run or runs).
  const tagged = !!remote && quiet('git', ['ls-remote', '--tags', remote, `refs/tags/v${version}`]).out.trim() !== '';
  if (!refusals.length && sha) {
    const stop = tagged
      ? undefined
      : docsGatesStop({
          version,
          sha,
          gates: gatesAt(sha),
          docsRevision: opts.docsRevision,
          ...(commit ? { commit } : {}),
        });
    if (stop) refusals.push(stop);
  }
  for (const r of refusals) console.error(`✖  ${r}`);
  if (opts.dryRun) {
    if (sha) say(commitLine(found, sha).replace(/^release commit /, 'release commit: '));
    for (const s of RELEASE_STEPS) say(`would run: ${s}`);
    process.exit(refusals.length ? 1 : 0);
  }
  if (refusals.length || !sha) process.exit(1);
  say(`preflight: ✔  ${commitLine(found, sha)}, ${version}, signed, gh and npm (${npmUser.out}) ready`);
  const again = releaseCommand(version, commit);
  const candidate = await waitForCandidate(sha, version, opts.startCandidate, commit);
  say(`tag: ship tag ${version} ${sha.slice(0, 7)} --candidate=${candidate} --sign`);
  const tag = ['tools/release/ship.mjs', 'tag', version, sha, `--candidate=${candidate}`, '--sign', '--no-watch'];
  if (opts.key) tag.push(`--key=${home(opts.key)}`);
  if (loud('node', tag) !== 0)
    throw new Error(
      `ship tag failed: fix what it says and run ${again} again (a tag already pushed is followed, not made again)`,
    );
  const warnings = await followRelease(sha, version, again);
  // Skipped on a resumed run when it already passed for exactly this release (#343); --reverify runs it anyway.
  await verifyOnce(version, process.argv.includes('--reverify'));
  await approveNpm(version);
  const latest = quiet('npm', ['view', '@quest-n-click/engine', 'dist-tags.latest']).out;
  say(`✔  ${version} released: https://github.com/${REPO}/releases/tag/v${version}`);
  say(
    `   npm @quest-n-click/* latest: ${latest}${latest === version ? '' : ` (not ${version}: npm view @quest-n-click/engine dist-tags)`}`,
  );
  if (warnings.length)
    say(`   ⚠  the documentation: ${warnings.join(', ')} (a docs revision republishes it; npm was not held back)`);
  if (warnings.length || opts.docsRevision) for (const step of docsRevisionSteps(version)) say(`      ${step}`);
  else say('   the documentation published itself (docs-publish)');
}
