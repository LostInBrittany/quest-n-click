// npm run release -- <x.y.z> [--key=<ssh public key>] [--start-candidate] [--dry-run]
// (4.5.4, part D of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) The maintainer's one command after the release pull
// request's merge, on main: it refuses first what would fail later (not the merged release, uncommitted changes, no
// CHANGELOG section, no SSH signing, gh or npm not signed in, an npm user who is not an owner); finds the candidate the
// merge started on that commit (or starts one, --start-candidate) and waits for it, saying where it is every minute,
// re-running its failed jobs once; then `ship tag … --sign` (main's ci, the signed tag pushed to the organisation's
// repository, the release run followed and its files verified); then the npm packages the release staged, approved
// one by one with the maintainer's 2FA, the engine first; then one summary. Run again after a stop, it goes on where
// it stopped: a green candidate is not waited for again, a tag already pushed is followed, a package already published
// is not approved again.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseNotes } from '../../scripts/release-notes.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { REPO, releaseRemote } from './lib.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { OWNERS } from './preflight.mjs';

const PACKAGES = ['engine', 'create', 'bridge', 'connectors', 'studio-server'].map((p) => `@quest-n-click/${p}`);

/** The steps, in the order a release takes. */
export const RELEASE_STEPS = ['preflight', 'candidate', 'tag and release', 'npm', 'summary'] as const;

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
  if (!o.gh) out.push('gh is not signed in: gh auth login');
  if (!o.npm) out.push('npm is not signed in: npm login (the approvals need an owner of the organisation, with 2FA)');
  else if (!o.owners.includes(o.npm))
    out.push(`npm user ${o.npm} is not an owner of the quest-n-click organisation (${o.owners.join(', ')})`);
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

/** The candidate a tag of `sha` names: the newest run of that commit started on main (a release's merge, or by hand). */
export function pickCandidate(runs: readonly Run[], sha: string): Run | undefined {
  return [...runs]
    .filter((r) => r.headSha === sha && r.headBranch === 'main' && ['push', 'workflow_dispatch'].includes(r.event))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

interface Job {
  name: string;
  status: string;
  conclusion: string;
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

/** The packages of `version` that `npm stage list` shows staged, the engine first, in the order of PACKAGES. */
export function stagedFor(list: string, version: string): { id: string; name: string }[] {
  const out: { id: string; name: string; version: string }[] = [];
  let cur: { id?: string; name?: string; version?: string } = {};
  const flush = () => {
    if (cur.id && cur.name && cur.version) out.push(cur as { id: string; name: string; version: string });
    cur = {};
  };
  for (const line of list.split('\n')) {
    const m = /^\s*(id|package name|version):\s*(\S+)/.exec(line);
    if (!m) continue;
    if (m[1] === 'id') {
      flush();
      cur.id = m[2];
    } else if (m[1] === 'package name') cur.name = m[2];
    else cur.version = m[2];
  }
  flush();
  return out
    .filter((p) => p.version === version)
    .sort((a, b) => PACKAGES.indexOf(a.name) - PACKAGES.indexOf(b.name))
    .map(({ id, name }) => ({ id, name }));
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

function signingReady(key: string | undefined) {
  if (key) return existsSync(key);
  return quiet('git', ['config', 'gpg.format']).out === 'ssh' && quiet('git', ['config', 'user.signingkey']).out !== '';
}

async function waitForCandidate(sha: string, startIt: boolean): Promise<number> {
  const list = () =>
    JSON.parse(
      sh('gh', [
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
      ]) || '[]',
    ) as Run[];
  let run = pickCandidate(list(), sha);
  if (!run && startIt) {
    say(`no candidate of ${sha.slice(0, 7)} on main: starting one`);
    sh('gh', ['workflow', 'run', 'candidate.yml', '--repo', REPO, '--ref', 'main', '-f', `sha=${sha}`]);
    for (let i = 0; i < 20 && !run; i++) {
      await sleep(15_000);
      run = pickCandidate(list(), sha);
    }
  }
  if (!run)
    throw new Error(
      `no candidate of ${sha.slice(0, 7)} on main: the release pull request's merge starts one; or run again with --start-candidate`,
    );
  say(`candidate run ${run.databaseId} (${run.event}): https://github.com/${REPO}/actions/runs/${run.databaseId}`);
  let rerun = false;
  let last = '';
  for (;;) {
    const view = JSON.parse(
      sh('gh', ['run', 'view', String(run.databaseId), '--repo', REPO, '--json', 'status,conclusion,jobs']),
    ) as { status: string; conclusion: string; jobs: Job[] };
    const line = candidateProgress(view.jobs);
    if (line !== last) say(`candidate: ${line}`);
    last = line;
    if (view.status === 'completed') {
      if (view.conclusion === 'success') return run.databaseId;
      const failed = view.jobs
        .filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out')
        .map((j) => j.name);
      if (rerun) throw new Error(`candidate run ${run.databaseId} failed again: ${failed.join(', ')}`);
      say(`candidate failed (${failed.join(', ')}): re-running its failed jobs once`);
      sh('gh', ['run', 'rerun', String(run.databaseId), '--repo', REPO, '--failed']);
      rerun = true;
      await sleep(30_000);
      continue;
    }
    await sleep(MINUTE);
  }
}

async function approveNpm(version: string) {
  const published = (p: string) => quiet('npm', ['view', `${p}@${version}`, 'version']).out === version;
  if (PACKAGES.every(published)) return say(`npm: the ${PACKAGES.length} packages are at ${version} already`);
  // The release run's npm-stage job stages them minutes after the tag: wait until every one is staged or published.
  let staged: { id: string; name: string }[] = [];
  for (let i = 0; i < 40; i++) {
    staged = stagedFor(quiet('npm', ['stage', 'list']).out, version);
    if (PACKAGES.every((p) => staged.some((s) => s.name === p) || published(p))) break;
    say(`npm: ${staged.length} of ${PACKAGES.length} packages staged, waiting for the release run's npm-stage job`);
    await sleep(MINUTE);
  }
  for (const s of staged) {
    say(`npm stage approve ${s.id}   # ${s.name}@${version} (your 2FA)`);
    if (loud('npm', ['stage', 'approve', s.id]) !== 0)
      throw new Error(`npm stage approve ${s.id} (${s.name}) failed: run it again`);
  }
  const missing = PACKAGES.filter((p) => !published(p));
  if (missing.length) throw new Error(`not on npm at ${version} yet: ${missing.join(', ')} (npm stage list)`);
}

export async function runRelease(version: string, opts: { key?: string; startCandidate: boolean; dryRun: boolean }) {
  const current = JSON.parse(readFileSync(join(ROOT(), 'package.json'), 'utf8')).version as string;
  let remote: string | undefined;
  try {
    remote = releaseRemote();
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
  }
  const fetched = remote ? quiet('git', ['fetch', '--quiet', remote, 'main']).code === 0 : false;
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
    gh: quiet('gh', ['auth', 'status']).code === 0,
    npm: npmUser.code === 0 && npmUser.out ? npmUser.out : undefined,
    owners: OWNERS,
  });
  for (const r of refusals) console.error(`✖  ${r}`);
  if (opts.dryRun) {
    for (const s of RELEASE_STEPS) say(`would run: ${s}`);
    process.exit(refusals.length ? 1 : 0);
  }
  if (refusals.length) process.exit(1);
  say(`preflight: ✔  main at ${head.slice(0, 7)}, ${version}, signed, gh and npm (${npmUser.out}) ready`);
  const candidate = await waitForCandidate(head, opts.startCandidate);
  say(`tag and release: ship tag ${version} ${head.slice(0, 7)} --candidate=${candidate} --sign`);
  const tag = ['tools/release/ship.mjs', 'tag', version, head, `--candidate=${candidate}`, '--sign'];
  if (opts.key) tag.push(`--key=${opts.key}`);
  if (loud('node', tag) !== 0)
    throw new Error(
      `ship tag failed: fix what it says and run npm run release -- ${version} again (a tag already pushed is followed, not made again)`,
    );
  await approveNpm(version);
  const latest = quiet('npm', ['view', '@quest-n-click/engine', 'dist-tags.latest']).out;
  say(
    `✔  ${version} released: https://github.com/${REPO}/releases/tag/v${version} · npm @quest-n-click/* latest ${latest} · the docs publish themselves (docs-publish)`,
  );
}
