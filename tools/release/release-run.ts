// npm run release -- <x.y.z> [--key=<ssh public key>] [--start-candidate] [--dry-run]
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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseNotes } from '../../scripts/release-notes.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { REPO, releaseRemote } from './lib.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { MINIMUM, NPM_NAMES, OWNERS } from './preflight.mjs';

/** The packages a release stages, the engine first (create depends on its exact version): preflight.mjs's list. */
const PACKAGES: readonly string[] = NPM_NAMES;

/** The steps, in the order a release takes. */
export const RELEASE_STEPS = ['preflight', 'candidate', 'tag and release', 'npm', 'summary'] as const;

const atLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split('.').map(Number)) as [number[], number[]];
  return (a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!) >= 0;
};

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

async function waitForCandidate(sha: string, startIt: boolean): Promise<number> {
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
    ghJson<{ status: string; conclusion: string; jobs: Job[] }>([
      'run',
      'view',
      String(id),
      '--repo',
      REPO,
      '--json',
      'status,conclusion,jobs',
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
    `candidate run ${run.databaseId} (${run.event}, about 90 min): https://github.com/${REPO}/actions/runs/${run.databaseId}`,
  );
  const started = Date.now();
  let rerun = false;
  let last = '';
  let said = 0;
  for (;;) {
    const view = await viewOf(run.databaseId);
    const line = candidateProgress(view.jobs);
    // Each change said, and a line every five minutes anyway.
    if (line !== last || Date.now() - said >= 5 * MINUTE) {
      say(`candidate (${Math.round((Date.now() - started) / MINUTE)} min): ${line}`);
      said = Date.now();
    }
    last = line;
    if (view.status === 'completed') {
      if (view.conclusion === 'success') return run.databaseId;
      const failed = view.jobs
        .filter((j) => j.status === 'completed' && !['success', 'skipped'].includes(j.conclusion))
        .map((j) => `${j.name} (${j.conclusion})`);
      if (rerun) throw new Error(`candidate run ${run.databaseId} failed again: ${failed.join(', ')}`);
      say(`candidate ${view.conclusion} (${failed.join(', ')}): re-running its failed jobs once`);
      sh('gh', ['run', 'rerun', String(run.databaseId), '--repo', REPO, '--failed']);
      rerun = true;
    }
    await sleep(MINUTE);
  }
}

/** The release run of the tag, followed job by job until npm can go on; the docs' jobs said, never waited on. */
async function followRelease(sha: string, version: string): Promise<string[]> {
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
        `release run ${run.databaseId}: ${v.failed.join(', ')} (https://github.com/${REPO}/actions/runs/${run.databaseId}); re-run it (gh run rerun ${run.databaseId} --repo ${REPO} --failed), then npm run release -- ${version} again`,
      );
    await sleep(MINUTE);
  }
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

export async function runRelease(version: string, opts: { key?: string; startCandidate: boolean; dryRun: boolean }) {
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
  const sha = remote && fetched ? findReleaseCommit(remote, version) : undefined;
  if (!refusals.length && !sha)
    refusals.push(`no commit of main sets package.json to ${version}: merge the release pull request first`);
  for (const r of refusals) console.error(`✖  ${r}`);
  if (opts.dryRun) {
    if (sha) say(`release commit: ${sha.slice(0, 7)}`);
    for (const s of RELEASE_STEPS) say(`would run: ${s}`);
    process.exit(refusals.length ? 1 : 0);
  }
  if (refusals.length || !sha) process.exit(1);
  say(`preflight: ✔  release commit ${sha.slice(0, 7)}, ${version}, signed, gh and npm (${npmUser.out}) ready`);
  const candidate = await waitForCandidate(sha, opts.startCandidate);
  say(`tag: ship tag ${version} ${sha.slice(0, 7)} --candidate=${candidate} --sign`);
  const tag = ['tools/release/ship.mjs', 'tag', version, sha, `--candidate=${candidate}`, '--sign', '--no-watch'];
  if (opts.key) tag.push(`--key=${home(opts.key)}`);
  if (loud('node', tag) !== 0)
    throw new Error(
      `ship tag failed: fix what it says and run npm run release -- ${version} again (a tag already pushed is followed, not made again)`,
    );
  const warnings = await followRelease(sha, version);
  if (loud('node', ['tools/release/ship.mjs', 'verify', version]) !== 0)
    throw new Error(`ship verify ${version} failed: the release's files do not verify (see above)`);
  await approveNpm(version);
  const latest = quiet('npm', ['view', '@quest-n-click/engine', 'dist-tags.latest']).out;
  say(`✔  ${version} released: https://github.com/${REPO}/releases/tag/v${version}`);
  say(
    `   npm @quest-n-click/* latest: ${latest}${latest === version ? '' : ` (not ${version}: npm view @quest-n-click/engine dist-tags)`}`,
  );
  if (warnings.length)
    say(`   ⚠  the documentation: ${warnings.join(', ')} (a docs revision republishes it; npm was not held back)`);
  else say('   the documentation published itself (docs-publish)');
}
