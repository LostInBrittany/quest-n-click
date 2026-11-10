// `npm run release -- <x.y.z>` end to end (#348): the command 4.5.4 ran for the first time on the release itself, where
// each of its bugs was found (#328, #341, #343). Here it runs through its CLI dispatch (tools/release/prepare.ts) on a
// scratch repository shaped like 4.5.4's history, against a fake GitHub (`gh`), a fake registry (`npm`) and a fake
// `ship`, its waits on a virtual clock (QNC_RELEASE_CLOCK=virtual: three hours of polling take no time). git is the real
// one, but for `git remote -v`, which names the organisation's repository on GitHub (the remote is a local bare one).
// The fakes keep their state in a JSON file the test writes and reads back, and log every call they answer.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { NPM_NAMES } from '../tools/release/preflight.mjs';

const REPO = 'Quest-n-Click/quest-n-click';
const V = '4.5.5';
const POSIX = process.platform !== 'win32';
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

interface RunState {
  workflow: string;
  headSha: string;
  headBranch: string;
  event: string;
  createdAt: string;
  /** The views of each attempt, in turn (the last one repeats); `gh run rerun` starts the next attempt. */
  attempts: {
    status: string;
    conclusion: string;
    jobs: { name: string; status: string; conclusion: string; databaseId?: number }[];
  }[][];
  attempt?: number;
  seen?: number;
  /** Listed only once this tag is on the remote (a release run starts on the tag's push). */
  afterTag?: string;
  /** candidate.yml's run-name, `candidate <sha>`: a dispatch's head is main's tip, its name the SHA it tests. */
  displayTitle?: string;
}
interface State {
  runs: Record<string, RunState>;
  release?: unknown;
  npm: { published: string[]; staged: { id: string; packageName: string; version: string }[] };
  ship?: { tagExit?: number; verifyExit?: number };
  /** Immutable releases off on the repository (ship tag refuses, the gate report says it first), or no answer. */
  immutable?: boolean | 'unreadable';
  /** `gh run view` answers without its jobs. */
  viewWithoutJobs?: boolean;
  /** What `wiki -- check --publish --reviews-only` prints when the docs' human gates fail (a ✖ line each). */
  docsPending?: string;
  /** The annotations of a job, by its id (`gh api repos/<repo>/check-runs/<id>/annotations`): `[]` when unlisted. */
  annotations?: Record<string, { title: string; annotation_level: string; message: string }[]>;
  /** The annotations endpoint fails (a 502 that does not pass). */
  annotationsFail?: boolean;
  /** How many empty lists a job's annotations answer before its own (written after the job ends, read too soon). */
  annotationsLag?: Record<string, number>;
}

// ——— The fakes. Each logs `[tool, ...args]` as a JSON line to FAKE_LOG and reads FAKE_STATE.
const COMMON = `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'));
const save = () => writeFileSync(process.env.FAKE_STATE, JSON.stringify(state, null, 2));
const log = (tool) => appendFileSync(process.env.FAKE_LOG, JSON.stringify([tool, ...args]) + '\\n');
const out = (v) => process.stdout.write(typeof v === 'string' ? v + '\\n' : JSON.stringify(v));
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const tagged = (t) => execFileSync('git', ['ls-remote', '--tags', 'upstream', 'refs/tags/' + t], { encoding: 'utf8' }).trim() !== '';
`;

const GH = `${COMMON}
log('gh');
const view = (id) => {
  const r = state.runs[id];
  const views = r.attempts[(r.attempt ?? 1) - 1];
  return { ...views[Math.min(r.seen ?? 0, views.length - 1)], attempt: r.attempt ?? 1 };
};
const listed = (id, r) => ({ databaseId: Number(id), headSha: r.headSha, headBranch: r.headBranch, event: r.event,
  createdAt: r.createdAt, displayTitle: r.displayTitle, attempt: r.attempt ?? 1,
  ...(({ status, conclusion }) => ({ status, conclusion }))(view(id)) });
const [a, b] = args;
if (a === 'auth') process.exit(0);
if (a === 'run' && b === 'list') {
  const wf = flag('--workflow').replace(/\\.yml$/, '');
  const sha = flag('--commit');
  const branch = flag('--branch');
  out(Object.entries(state.runs)
    .filter(([, r]) => r.workflow === wf && (!sha || r.headSha === sha) && (!branch || r.headBranch === branch))
    .filter(([, r]) => !r.afterTag || tagged(r.afterTag))
    .map(([id, r]) => listed(id, r)));
  process.exit(0);
}
if (a === 'run' && b === 'view') {
  const id = args[2];
  if (!state.runs[id]) { console.error('run not found'); process.exit(1); }
  // A reply without its jobs (#471 review): read as not read, never as a candidate or a crash.
  if (state.viewWithoutJobs) { out({ status: 'completed', conclusion: 'success' }); process.exit(0); }
  const v = view(id);
  state.runs[id].seen = (state.runs[id].seen ?? 0) + 1;
  save();
  out(v);
  process.exit(0);
}
if (a === 'run' && b === 'rerun') {
  const r = state.runs[args[2]];
  if (!r.attempts[r.attempt ?? 1]) { console.error('no attempt left in the fake'); process.exit(1); }
  r.attempt = (r.attempt ?? 1) + 1;
  r.seen = 0;
  save();
  process.exit(0);
}
// As GitHub: a dispatch on main runs at main's tip, its name the SHA it tests (candidate.yml's run-name), green.
if (a === 'workflow' && b === 'run') {
  const sha = args.find((x) => x.startsWith('sha=')).slice(4);
  const tip = execFileSync('git', ['rev-parse', 'upstream/main'], { encoding: 'utf8' }).trim();
  state.runs['77'] = { workflow: 'candidate', headSha: tip, headBranch: 'main', event: 'workflow_dispatch',
    createdAt: '2026-10-28T10:00:00Z', displayTitle: 'candidate ' + sha,
    attempts: [[{ status: 'completed', conclusion: 'success', jobs: [{ name: 'target', status: 'completed', conclusion: 'success' }] }]] };
  save();
  process.exit(0);
}
// ship tag's own check (4.1.20), read up front by the gate report (#471): on unless the state says off; an answer
// that is no JSON (a network error) when it says 'unreadable'.
if (a === 'api' && /immutable-releases$/.test(b)) {
  if (state.immutable === 'unreadable') { console.error('connection reset'); process.exit(1); }
  out({ enabled: state.immutable !== false });
  process.exit(0);
}
// A job's annotations (#471): the mutation verdict a red shard writes, read by the release command.
if (a === 'api' && /\\/check-runs\\/\\d+\\/annotations$/.test(b)) {
  if (state.annotationsFail) { console.error('HTTP 502: Bad Gateway'); process.exit(1); }
  const id = b.split('/').at(-2);
  if ((state.annotationsLag ?? {})[id] > 0) { state.annotationsLag[id]--; save(); out([]); process.exit(0); }
  out((state.annotations ?? {})[id] ?? []);
  process.exit(0);
}
if (a === 'api' && /releases\\/tags\\//.test(b)) {
  if (!state.release) { console.error('HTTP 404'); process.exit(1); }
  out(state.release);
  process.exit(0);
}
console.error('fake gh: no answer for ' + args.join(' '));
process.exit(1);
`;

const NPM = `${COMMON}
log('npm');
const [a, b] = args;
if (a === 'whoami') out('lostinbrittany');
else if (a === '--version') out('11.19.1');
// The docs' human gates (humanGates): they hold, unless the state says what is pending.
else if (a === 'run' && args.includes('--reviews-only')) {
  if (state.docsPending) { out(state.docsPending); process.exit(1); }
  out('✔  0 error(s)');
}
else if (a === 'view') {
  const [pkg, v] = b.replace(/^@/, '\\u0000').split('@').map((x) => x.replace('\\u0000', '@'));
  if (args[2] === 'dist-tags.latest') out(state.npm.published.includes('@quest-n-click/engine') ? '${V}' : '4.5.4');
  else if (state.npm.published.includes(pkg) && v === '${V}') out(v);
  else { console.error('E404'); process.exit(1); }
} else if (a === 'stage' && b === 'list') out(state.npm.staged);
else if (a === 'stage' && b === 'approve') {
  const s = state.npm.staged.find((x) => x.id === args[2]);
  state.npm.staged = state.npm.staged.filter((x) => x !== s);
  state.npm.published.push(s.packageName);
  save();
} else { console.error('fake npm: no answer for ' + args.join(' ')); process.exit(1); }
`;

// The release command runs \`node tools/release/ship.mjs\` from the repository: this one, committed in the scratch repository.
const SHIP = `${COMMON}
log('ship');
const [cmd, version, sha] = args;
if (cmd === 'tag') {
  if (state.ship?.tagExit) process.exit(state.ship.tagExit);
  // As the real one: a tag already on the remote at that commit is followed, never made again.
  if (!tagged('v' + version)) {
    execFileSync('git', ['tag', '-a', 'v' + version, '-m', version, sha]);
    execFileSync('git', ['push', '-q', 'upstream', 'refs/tags/v' + version]);
  }
  process.exit(0);
}
if (cmd === 'verify') process.exit(state.ship?.verifyExit ?? 0);
process.exit(1);
`;

// git's own binary, not a wrapper in front of it (macOS's /usr/bin/git is xcrun's).
const realGit = POSIX ? join(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), 'git') : 'git';
let shared: string | undefined;
/**
 * The fakes, written once for the file: they read their state and log from the environment. (A new executable costs
 * about a second on its first run on macOS, its scan: once, not once a scenario.)
 */
function fakes() {
  if (shared) return shared;
  shared = mkdtempSync(join(tmpdir(), 'release-command-bin-'));
  temps.push(shared);
  writeFileSync(
    join(shared, 'git'),
    `#!/bin/sh\nif [ "$1" = remote ] && [ "$2" = -v ]; then\n  printf 'upstream\\tgit@github.com:${REPO}.git (fetch)\\nupstream\\tgit@github.com:${REPO}.git (push)\\n'\n  exit 0\nfi\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(join(shared, 'gh'), `#!/usr/bin/env node\n${GH}`, { mode: 0o755 });
  writeFileSync(join(shared, 'npm'), `#!/usr/bin/env node\n${NPM}`, { mode: 0o755 });
  return shared;
}

/** A scratch repository on main whose upstream is a local bare repository, with 4.5.4's history shape. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'release-command-'));
  temps.push(dir);
  const bare = join(dir, 'upstream.git');
  const repo = join(dir, 'repo');
  const bin = fakes();
  const git = (...a: string[]) =>
    execFileSync(realGit, ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], {
      encoding: 'utf8',
    }).trim();
  execFileSync(realGit, ['init', '-q', '--bare', '-b', 'main', bare]);
  execFileSync(realGit, ['init', '-q', '-b', 'main', repo]);
  const key = join(dir, 'key.pub');
  writeFileSync(key, 'ssh-ed25519 AAAAC3NzaFAKEKEY t@t\n');
  for (const [k, v] of [
    ['user.email', 't@t'],
    ['user.name', 't'],
    ['commit.gpgsign', 'false'],
    ['tag.gpgsign', 'false'],
    ['gpg.format', 'ssh'],
    ['user.signingkey', key],
  ])
    git('config', k!, v!);
  git('remote', 'add', 'upstream', bare);
  const write = (f: string, text: string) => {
    mkdirSync(join(repo, f, '..'), { recursive: true });
    writeFileSync(join(repo, f), text);
  };
  const pkg = (version: string, deps = '') => `{\n  "name": "scratch",\n  "version": "${version}"${deps}\n}\n`;
  write('package.json', pkg('4.5.4'));
  write('CHANGELOG.md', '# Changelog\n\n## 4.5.4 — 2026-10-25\n\n- x\n');
  write('.github/allowed_signers', 't@t ssh-ed25519 AAAAC3NzaFAKEKEY\n');
  write('.gitignore', '.cache/\nnode_modules\n');
  write('tools/release/ship.mjs', SHIP);
  git('add', '-A');
  git('commit', '-q', '-m', '4.5.4');
  // The release pull request: prepare's commit, the prose, a review; merged; then main moves on (one merge touches
  // package.json, one does not): 4.5.4's history, where the walk down the branch named the prepare commit (#328).
  git('switch', '-q', '-c', `release/${V}`);
  write('package.json', pkg(V));
  write('CHANGELOG.md', `# Changelog\n\n## ${V} — 2026-10-26\n\n- y\n\n## 4.5.4 — 2026-10-25\n\n- x\n`);
  git('commit', '-q', '-am', `${V}: the release (prepared by npm run release -- prepare)`);
  const prepared = git('rev-parse', 'HEAD');
  write('README.md', 'the prose\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'the prose');
  write('wiki/reviews.json', '{}\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'a review');
  git('switch', '-q', 'main');
  git('merge', '-q', '--no-ff', '-m', `Merge pull request #1 from release/${V}`, `release/${V}`);
  const merge = git('rev-parse', 'HEAD');
  const later = (name: string, f: string, text: string) => {
    git('switch', '-q', '-c', name);
    write(f, text);
    git('add', '-A');
    git('commit', '-q', '-m', name);
    git('switch', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', `Merge ${name}`, name);
  };
  later('deps', 'package.json', pkg(V, ',\n  "dependencies": {}'));
  later('notes', 'notes.md', 'later\n');
  git('push', '-q', 'upstream', 'main');
  const state = join(dir, 'state.json');
  const logFile = join(dir, 'calls.jsonl');
  writeFileSync(logFile, '');
  // Main's ci green on every commit of main (what ship tag waits for and the gate report reads, #471), unless the
  // test gives its own ci runs.
  const setState = (s: State) => {
    const ci = Object.values(s.runs).some((r) => r.workflow === 'ci');
    const shas = git('rev-list', '--first-parent', 'main').split('\n');
    if (!ci)
      shas.forEach((sha, i) => {
        s.runs[`9${i}`] = {
          workflow: 'ci',
          headSha: sha,
          headBranch: 'main',
          event: 'push',
          createdAt: '2026-10-26T09:00:00Z',
          attempts: [[{ status: 'completed', conclusion: 'success', jobs: [] }]],
        };
      });
    writeFileSync(state, JSON.stringify(s, null, 2));
  };
  const getState = () => JSON.parse(readFileSync(state, 'utf8')) as State;
  const calls = () =>
    readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
  /** `npm run release -- <V> …args`, as the maintainer types it: tsx on prepare.ts, which dispatches to runRelease. */
  const release = (...args: string[]) => {
    writeFileSync(logFile, '');
    const r = spawnSync(
      process.execPath,
      [resolve('node_modules/tsx/dist/cli.mjs'), resolve('tools/release/prepare.ts'), V, ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_STATE: state,
          FAKE_LOG: logFile,
          QNC_RELEASE_CLOCK: 'virtual',
          WEB_SCUMM_REPO: REPO,
          GITHUB_ACTIONS: '',
        },
      },
    );
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: calls() };
  };
  /** `node tools/release/ship.mjs …args` (the real one), against the same fakes. */
  const ship = (...args: string[]) => {
    writeFileSync(logFile, '');
    const r = spawnSync(process.execPath, [resolve('tools/release/ship.mjs'), ...args], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_STATE: state,
        FAKE_LOG: logFile,
        QNC_RELEASE_CLOCK: 'virtual',
        WEB_SCUMM_REPO: REPO,
        SHIP_PIDS: join(dir, 'pids'),
        GITHUB_ACTIONS: '',
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: calls() };
  };
  return { dir, repo, git, merge, prepared, setState, getState, release, ship };
}

const job = (name: string, status = 'completed', conclusion = 'success', databaseId?: number) => ({
  name,
  status,
  conclusion,
  ...(databaseId ? { databaseId } : {}),
});
const green = { status: 'completed', conclusion: 'success', jobs: [job('target'), job('heavy (1)'), job('pack')] };
const running = { status: 'in_progress', conclusion: '', jobs: [job('target'), job('heavy (1)', 'in_progress', '')] };
const failed = {
  status: 'completed',
  conclusion: 'failure',
  jobs: [job('target'), job('heavy (1)', 'completed', 'failure'), job('pack')],
};
const candidate = (sha: string, ...attempts: RunState['attempts']): RunState => ({
  workflow: 'candidate',
  headSha: sha,
  headBranch: 'main',
  event: 'push',
  createdAt: '2026-10-26T10:00:00Z',
  attempts,
});
const releaseRun = (sha: string, jobs = [job('release'), job('npm-stage'), job('docs-publish / publish')]) => ({
  workflow: 'release',
  headSha: sha,
  headBranch: `v${V}`,
  event: 'push',
  createdAt: '2026-10-26T12:00:00Z',
  afterTag: `v${V}`,
  attempts: [[{ status: 'completed', conclusion: 'success', jobs }]],
});
const staged = (...names: string[]) =>
  names.map((n, i) => ({ id: `stage-${i}-${n.split('/')[1]}`, packageName: n, version: V }));
const releaseJson = {
  id: 9,
  immutable: true,
  assets: [
    { name: `quest-n-click-${V}.tgz`, digest: 'sha256:aa' },
    { name: `quest-n-click-v${V}-SHA256SUMS`, digest: 'sha256:bb' },
  ],
};
const PACKAGES: string[] = NPM_NAMES;
/** The calls of one tool, each as one line. */
const of = (calls: string[][], tool: string) => calls.filter((c) => c[0] === tool).map((c) => c.slice(1).join(' '));

describe.skipIf(!POSIX)('npm run release -- <version>, end to end (#348)', () => {
  it("on 4.5.4's history: the merge is the release commit, its candidate tagged, the release followed, npm approved", () => {
    const s = scratch();
    s.setState({
      runs: {
        // The pull request's candidate of the prepare commit, and a push of a later merge (no release: target skipped).
        '10': { ...candidate(s.prepared, [green]), event: 'pull_request', headBranch: `release/${V}` },
        '11': candidate(s.merge, [green]),
        '12': {
          ...candidate(s.git('rev-parse', 'HEAD'), [
            { status: 'completed', conclusion: 'success', jobs: [job('target', 'completed', 'skipped')] },
          ]),
        },
        '20': releaseRun(s.merge),
      },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    // The dry run names it first, and does nothing.
    const dry = s.release('--dry-run');
    expect(dry.out).toContain(`release commit: ${s.merge.slice(0, 7)}`);
    expect(of(dry.calls, 'ship')).toEqual([]);
    expect(dry.status).toBe(0);

    const r = s.release();
    expect(r.out).toContain(`preflight: ✔  release commit ${s.merge.slice(0, 7)}`);
    expect(r.out).toContain('candidate run 11 (push, about 90 min, given up after 3 h an attempt)');
    expect(of(r.calls, 'ship')).toEqual([`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`, `verify ${V}`]);
    expect(s.git('ls-remote', '--tags', 'upstream', `refs/tags/v${V}^{}`).split('\t')[0]).toBe(s.merge);
    // The docs' human gates were judged on the release commit's tree, before the tag.
    expect(of(r.calls, 'npm').some((c) => c.includes('--reviews-only'))).toBe(true);
    // Every package approved once, the engine first.
    const approved = of(r.calls, 'npm').filter((c) => c.startsWith('stage approve'));
    expect(approved).toEqual(staged(...PACKAGES).map((p) => `stage approve ${p.id}`));
    expect(approved[0]).toContain('engine');
    expect(r.out).toContain(`✔  ${V} released`);
    expect(r.out).toContain('the documentation published itself');
    expect(r.status).toBe(0);
  }, 120_000);

  it('re-runs a failed candidate once, then tags it green', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [running, failed], [running, green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain('candidate failure (heavy (1) failure): re-running its failed jobs once');
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([
      `run rerun 11 --repo ${REPO} --failed`,
    ]);
    expect(of(r.calls, 'ship')[0]).toBe(`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`);
    expect(r.status).toBe(0);
  }, 120_000);

  it('re-runs a candidate cancelled before any job failed whole, and says so without an empty list', () => {
    const s = scratch();
    const cancelled = { status: 'completed', conclusion: 'cancelled', jobs: [job('target')] };
    s.setState({
      runs: { '11': candidate(s.merge, [cancelled], [green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain('candidate cancelled before any job failed: re-running the whole run once');
    expect(r.out).not.toMatch(/\(\)/);
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([`run rerun 11 --repo ${REPO}`]);
    expect(r.status).toBe(0);
  }, 120_000);

  it('stops on a second failure, and a relaunch never spends a second re-run', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [failed], [running, failed], [green]) },
      npm: { published: [], staged: [] },
    });
    const first = s.release();
    expect(first.out).toMatch(/candidate run 11 failed again \(attempt 2\): heavy \(1\) failure/);
    expect(first.status).toBe(1);
    const again = s.release();
    expect(again.out).toMatch(/candidate run 11 failed again \(attempt 2\)/);
    expect(of(again.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([]);
    expect(of(again.calls, 'ship')).toEqual([]);
    expect(again.status).toBe(1);
  }, 120_000);

  it('gives up on a candidate still going after three hours, says how to resume, tags nothing', () => {
    const s = scratch();
    s.setState({ runs: { '11': candidate(s.merge, [running]) }, npm: { published: [], staged: [] } });
    const r = s.release();
    expect(r.out).toMatch(/candidate run 11 not done after 180 min/);
    expect(r.out).toContain(`run npm run release -- ${V} again to resume`);
    expect(of(r.calls, 'ship')).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  // ——— No blind re-run of a mutation verdict (#471): 4.7.2's candidate 42527046788, red on eleven survivors in six
  // shards, was re-run by this command and spent 72 minutes failing the same six.
  const verdict = (header: string, ...survivors: string[]) => [
    { title: '', annotation_level: 'failure', message: 'Process completed with exit code 1.' },
    { title: 'mutation verdict', annotation_level: 'failure', message: [header, ...survivors].join('\n') },
  ];
  const AUTH = verdict(
    'studio-auth shard 1/1: 3 survivors not named in docs/dev/mutants.json',
    'studio-server/src/server/auth/gate.ts:152 condition true: !flight → true',
    'studio-server/src/server/auth/gate.ts:162 condition true: !(e instanceof DefinitiveRefusal) → true',
    'studio-server/src/server/auth/routes.ts:44 operator: > → >=',
  );
  const RUNS = verdict(
    'runs shard 1/1: 1 survivor not named in docs/dev/mutants.json',
    'bridge/src/runs-store.ts:459 condition false: tenantId === undefined → false',
  );
  const survivors = (...more: ReturnType<typeof job>[]) => ({
    status: 'completed',
    conclusion: 'failure',
    jobs: [
      job('target'),
      job('mutation / mutation (studio-auth-1of1)', 'completed', 'failure', 501),
      job('mutation / mutation (runs-1of1)', 'completed', 'failure', 502),
      job('mutation / mutation (core-1of1)', 'completed', 'success', 503),
      job('mutation / merge', 'completed', 'failure', 504),
      ...more,
      job('candidate-gate', 'completed', 'failure', 505),
    ],
  });
  const reruns = (calls: string[][]) => of(calls, 'gh').filter((c) => c.startsWith('run rerun'));

  it("a candidate red on mutation survivors is not re-run: the stop lists them, exit 1 (4.7.2's 42527046788)", () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [running, survivors()], [green]) },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(reruns(r.calls)).toEqual([]);
    expect(of(r.calls, 'ship')).toEqual([]);
    expect(r.out).toContain('candidate run 11: mutation survivors, not re-run');
    expect(r.out).toContain('✖ mutation / mutation (studio-auth-1of1): studio-auth shard 1/1: 3 survivors not named');
    expect(r.out).toContain('studio-server/src/server/auth/routes.ts:44 operator: > → >=');
    expect(r.out).toContain('✖ mutation / mutation (runs-1of1): runs shard 1/1: 1 survivor not named');
    expect(r.out).toContain('bridge/src/runs-store.ts:459 condition false: tenantId === undefined → false');
    expect(r.out).toContain(`npm run release -- ${V} --commit=<the fix's merge sha> --start-candidate`);
    // Only the red jobs' annotations are read; the green shard's are not asked for.
    expect(of(r.calls, 'gh').some((c) => c.includes('check-runs/503/'))).toBe(false);
    expect(r.status).toBe(1);
  }, 120_000);

  it('the gate report says it first: --dry-run refuses on the candidate line, survivors under it', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [survivors()]) },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toMatch(/✖ {2}the candidate of [0-9a-f]{7}: candidate run 11: mutation survivors, not re-run/);
    expect(r.out).toContain('studio-server/src/server/auth/gate.ts:152 condition true: !flight → true');
    expect(r.out).toContain(
      `next: kill or name each survivor above, merge the fix on main, then npm run release -- ${V} --commit=<the fix's merge sha> --start-candidate`,
    );
    expect(reruns(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('stops at the first verdict while the run goes on: no wait for the other shards, no re-run', () => {
    const s = scratch();
    const going = {
      status: 'in_progress',
      conclusion: '',
      jobs: [
        job('target'),
        job('mutation / mutation (runs-1of1)', 'completed', 'failure', 502),
        job('mutation / mutation (connectors-edge-1of4)', 'in_progress', '', 506),
      ],
    };
    s.setState({
      runs: { '11': candidate(s.merge, [running, going]) },
      annotations: { '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(r.out).toContain('candidate run 11: mutation survivors, not re-run');
    expect(r.out).toContain('the run goes on on GitHub, not waited for');
    expect(r.out).not.toMatch(/not done after 180 min/);
    expect(reruns(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('mixed reds (connector-archive-e2e beside the survivors): still no re-run, the other red named', () => {
    const s = scratch();
    const mixed = survivors(job('connector-archive-e2e', 'completed', 'failure', 507));
    s.setState({
      runs: { '11': candidate(s.merge, [running, mixed], [green]) },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(reruns(r.calls)).toEqual([]);
    expect(r.out).toMatch(/also red: .*connector-archive-e2e failure/);
    expect(r.status).toBe(1);
  }, 120_000);

  it('a mutation job cancelled or timed out (no verdict) is re-run once as before, then tagged green', () => {
    const s = scratch();
    const died = {
      status: 'completed',
      conclusion: 'failure',
      jobs: [
        job('target'),
        job('mutation / mutation (studio-auth-1of1)', 'completed', 'timed_out', 501),
        job('mutation / mutation (runs-1of1)', 'completed', 'cancelled', 502),
        job('mutation / merge', 'completed', 'failure', 504),
      ],
    };
    s.setState({
      runs: { '11': candidate(s.merge, [running, died], [running, green]), '20': releaseRun(s.merge) },
      // A job that failed without a verdict carries only GitHub's own line.
      annotations: {
        '504': [{ title: '', annotation_level: 'failure', message: 'Process completed with exit code 2.' }],
      },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain('re-running its failed jobs once');
    expect(reruns(r.calls)).toEqual([`run rerun 11 --repo ${REPO} --failed`]);
    expect(of(r.calls, 'ship')[0]).toBe(`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`);
    expect(r.status).toBe(0);
  }, 120_000);

  // ——— The review of #471 PR 4: an unreadable or empty annotations answer, the later commit beside a verdict.
  it('an annotations read that keeps failing: one try per look, no false verdict, the single re-run as before', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [running, survivors()], [running, green]), '20': releaseRun(s.merge) },
      annotations: { '501': AUTH, '502': RUNS },
      annotationsFail: true,
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(reruns(r.calls)).toEqual([`run rerun 11 --repo ${REPO} --failed`]);
    expect(r.out).not.toContain('mutation survivors');
    expect(of(r.calls, 'ship')[0]).toBe(`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`);
    // At most one annotations call per look at the run: never ghJson's eleven tries, never one per red job.
    const looks = of(r.calls, 'gh').filter((c) => c.startsWith('run view 11')).length;
    const asked = of(r.calls, 'gh').filter((c) => c.includes('/annotations')).length;
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThanOrEqual(looks);
    expect(r.status).toBe(0);
  }, 120_000);

  it('an empty annotations list (not written yet) is asked again at the next look, then stops on the verdict', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [survivors()], [green]) },
      annotations: { '501': AUTH, '502': RUNS },
      // The gate report's look gets [] for both shards; the wait's first look gets the verdicts.
      annotationsLag: { '501': 1, '502': 1 },
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(r.out).toContain('candidate run 11: mutation survivors, not re-run');
    expect(reruns(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('a verdict and later commits without a candidate: the fix comes first, no later commit named', () => {
    const s = scratch();
    const tip = s.git('rev-parse', 'HEAD');
    s.setState({
      runs: { '11': candidate(s.merge, [survivors()]) },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toContain(
      `next: kill or name each survivor above, merge the fix on main, then npm run release -- ${V} --commit=<the fix's merge sha> --start-candidate`,
    );
    expect(r.out).not.toContain(`--commit=${tip}`);
    expect(r.out).not.toContain('No later candidate');
    expect(r.status).toBe(1);
  }, 120_000);

  it('a verdict and a later commit with a green candidate: that commit is named, its command in full', () => {
    const s = scratch();
    const tip = s.git('rev-parse', 'HEAD');
    s.setState({
      runs: {
        '11': candidate(s.merge, [survivors()]),
        '12': { ...candidate(tip, [green]), event: 'workflow_dispatch', displayTitle: `candidate ${tip}` },
      },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toContain(`A later candidate of ${V} is green on ${tip.slice(0, 7)} (run 12`);
    expect(r.out).toContain(`   next: npm run release -- ${V} --commit=${tip}`);
    expect(r.out).not.toContain('may not hold the fix');
    expect(r.status).toBe(1);
  }, 120_000);

  it('a verdict and a later candidate still running: named, with "it may not hold the fix"', () => {
    const s = scratch();
    const tip = s.git('rev-parse', 'HEAD');
    s.setState({
      runs: {
        '11': candidate(s.merge, [survivors()]),
        '12': { ...candidate(tip, [running]), event: 'workflow_dispatch', displayTitle: `candidate ${tip}` },
      },
      annotations: { '501': AUTH, '502': RUNS },
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toContain(`A later candidate of ${V} is running on ${tip.slice(0, 7)}`);
    expect(r.out).toMatch(/A later candidate .* is running .*it may not hold the fix/);
    expect(r.out).toMatch(/next: npm run release -- \S+ --commit=[0-9a-f]{40} \(it may not hold the fix\)/);
    expect(r.status).toBe(1);
  }, 120_000);

  it("a verdict and the docs' human gates red: next keeps the docs' way on beside the fix", () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [survivors()]) },
      annotations: { '501': AUTH, '502': RUNS },
      docsPending:
        "✖  create.rooms: the claim bridge-email-unseen-when-away's review is stale (its test file changed): npm run wiki -- review-claim bridge-email-unseen-when-away --by <name> --kind human --relation independent",
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    const next = r.out.split('\n').find((l) => l.includes('next:')) ?? '';
    expect(next).toContain('kill or name each survivor above');
    expect(next).toContain('--docs-revision');
    expect(next).not.toContain('fix the other ✖ above');
    expect(r.status).toBe(1);
  }, 120_000);

  it("--commit=<sha> releases on a later commit of main, its candidate tagged: the merge's own ci was red (4.5.5)", () => {
    const s = scratch();
    const later = s.git('rev-parse', 'HEAD');
    s.setState({
      runs: {
        '11': candidate(s.merge, [failed]),
        '12': { ...candidate(later, [green]), event: 'workflow_dispatch' },
        '20': releaseRun(later),
      },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    // Refused first: a commit that is not main's, one before the release, one that is not a SHA.
    const first4 = s.git('rev-list', '--max-parents=0', 'HEAD');
    for (const [arg, why] of [
      [s.prepared, "is not on main's first-parent line"],
      [first4, 'package.json is at 4.5.4'],
      ['main', 'is not a commit SHA'],
    ] as const) {
      const r = s.release(`--commit=${arg}`, '--dry-run');
      expect(r.out).toContain(why);
      expect(r.status).toBe(1);
    }
    const dry = s.release(`--commit=${later.slice(0, 10)}`, '--dry-run');
    expect(dry.out).toContain(
      `release commit: ${later.slice(0, 7)} (--commit: a later commit of main, not the release merge ${s.merge.slice(0, 7)})`,
    );
    expect(dry.status).toBe(0);

    const r = s.release(`--commit=${later}`);
    expect(r.out).toContain(`preflight: ✔  release commit ${later.slice(0, 7)} (--commit`);
    expect(r.out).toContain('candidate run 12 (workflow_dispatch');
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([]);
    expect(of(r.calls, 'ship')).toEqual([`tag ${V} ${later} --candidate=12 --sign --no-watch`, `verify ${V}`]);
    expect(s.git('ls-remote', '--tags', 'upstream', `refs/tags/v${V}^{}`).split('\t')[0]).toBe(later);
    expect(r.status).toBe(0);
    // Once tagged, a relaunch without it follows the tag; another commit is refused.
    expect(s.release(`--commit=${s.merge}`, '--dry-run').out).toContain(
      `v${V} is tagged on ${later.slice(0, 7)} already`,
    );
    expect(s.release('--dry-run').out).toContain(`release commit: ${later.slice(0, 7)}`);
  }, 180_000);

  it('a relaunch after the tag is pushed resumes: the same commit, no second tag, no gates, no second wait', () => {
    const s = scratch();
    const blocked = releaseRun(s.merge, [job('release'), job('npm-stage', 'completed', 'failure')]);
    s.setState({
      runs: { '11': candidate(s.merge, [green]), '20': blocked },
      release: releaseJson,
      npm: { published: [], staged: [] },
    });
    const first = s.release();
    expect(first.out).toMatch(/release run 20: npm-stage: failure/);
    expect(first.status).toBe(1);
    const tagObject = s.git('ls-remote', '--tags', 'upstream', `refs/tags/v${V}`).split('\t')[0];
    // Meanwhile main moves on, and npm-stage is re-run green.
    s.git('commit', '-q', '--allow-empty', '-m', 'after the tag');
    s.git('push', '-q', 'upstream', 'main');
    const st = s.getState();
    st.runs['20'] = releaseRun(s.merge);
    st.npm.staged = staged(...PACKAGES);
    s.setState(st);
    const again = s.release();
    expect(again.out).toContain(`release commit ${s.merge.slice(0, 7)}`);
    expect(of(again.calls, 'npm').some((c) => c.includes('--reviews-only'))).toBe(false);
    expect(of(again.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([]);
    expect(of(again.calls, 'ship')[0]).toBe(`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`);
    expect(s.git('ls-remote', '--tags', 'upstream', `refs/tags/v${V}`).split('\t')[0]).toBe(tagObject);
    expect(again.status).toBe(0);
    // Once more, everything done: ship verify skipped (#343), nothing approved again.
    const done = s.release();
    expect(done.out).toMatch(/verify: already passed at .* skipped/);
    expect(of(done.calls, 'ship')).toEqual([`tag ${V} ${s.merge} --candidate=11 --sign --no-watch`]);
    expect(done.out).toContain(`npm: the ${PACKAGES.length} packages are at ${V} already`);
    expect(of(done.calls, 'npm').filter((c) => c.startsWith('stage approve'))).toEqual([]);
    expect(done.status).toBe(0);
  }, 180_000);

  it('a failing docs-publish is a warning: npm is approved all the same, the revision steps said', () => {
    const s = scratch();
    s.setState({
      runs: {
        '11': candidate(s.merge, [green]),
        '20': releaseRun(s.merge, [
          job('release'),
          job('npm-stage'),
          job('docs-publish / publish', 'completed', 'failure'),
        ]),
      },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(of(r.calls, 'npm').filter((c) => c.startsWith('stage approve'))).toHaveLength(PACKAGES.length);
    expect(r.out).toContain('⚠  the documentation: docs-publish / publish: failure');
    expect(r.out).toContain(`git switch -c docs/${V} v${V}`);
    expect(r.status).toBe(0);
  }, 120_000);

  it('npm stage list empty: stops naming every package, approves nothing', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(r.out).toContain(`neither staged nor published: ${PACKAGES.join(', ')}`);
    expect(of(r.calls, 'npm').filter((c) => c.startsWith('stage approve'))).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('npm stage list partial: a published package is not approved again; a missing one stops before any approval', () => {
    const s = scratch();
    const [engine, ...others] = PACKAGES as [string, ...string[]];
    s.setState({
      runs: { '11': candidate(s.merge, [green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [engine], staged: staged(...others) },
    });
    const r = s.release();
    expect(of(r.calls, 'npm').filter((c) => c.startsWith('stage approve'))).toEqual(
      staged(...others).map((p) => `stage approve ${p.id}`),
    );
    expect(r.status).toBe(0);

    const t = scratch();
    t.setState({
      runs: { '11': candidate(t.merge, [green]), '20': releaseRun(t.merge) },
      release: releaseJson,
      npm: { published: [], staged: staged(engine) },
    });
    const missing = t.release();
    expect(missing.out).toContain(`neither staged nor published: ${others.join(', ')}`);
    expect(of(missing.calls, 'npm').filter((c) => c.startsWith('stage approve'))).toEqual([]);
    expect(missing.status).toBe(1);
  }, 180_000);
});

describe.skipIf(!POSIX)('the gate report, before anything is done (#471)', () => {
  const ciRun = (sha: string, conclusion: string, attempt = 1): RunState => ({
    workflow: 'ci',
    headSha: sha,
    headBranch: 'main',
    event: 'push',
    createdAt: '2026-10-26T09:00:00Z',
    attempt,
    attempts: Array.from({ length: attempt }, () => [{ status: 'completed', conclusion, jobs: [] }]),
  });
  const PENDING =
    "✖  create.rooms: the claim bridge-email-unseen-when-away's review is stale (its test file changed): npm run wiki -- review-claim bridge-email-unseen-when-away --by <name> --kind human --relation independent";
  const sideEffects = (calls: string[][]) => [
    ...of(calls, 'ship'),
    ...of(calls, 'gh').filter((c) => /^run rerun|^workflow run|-X POST/.test(c)),
    ...of(calls, 'npm').filter((c) => c.startsWith('stage approve')),
  ];

  it('all green: one line per gate, then the command goes on; the dry run says it would go through', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const dry = s.release('--dry-run');
    expect(dry.out).toContain(`the gates of ${V}, release commit ${s.merge.slice(0, 7)}, before anything is done:`);
    for (const line of [
      `✔  preflight: main at ${V}`,
      `✔  main's ci on ${s.merge.slice(0, 7)}: green`,
      `✔  the docs' human gates on ${s.merge.slice(0, 7)}: they hold`,
      `✔  the candidate of ${s.merge.slice(0, 7)}: green (run 11)`,
      `✔  tag: CHANGELOG section at ${s.merge.slice(0, 7)}, no stable tag below it, immutable releases on`,
      `✔  no gate refuses: npm run release -- ${V} would go through`,
    ])
      expect(dry.out).toContain(line);
    expect(sideEffects(dry.calls)).toEqual([]);
    expect(dry.status).toBe(0);
  }, 120_000);

  it("4.7.2's reset claim on --commit: refused before a candidate is started, the reviews' way on said", () => {
    const s = scratch();
    const later = s.git('rev-parse', 'HEAD');
    s.setState({ runs: {}, docsPending: PENDING, npm: { published: [], staged: [] } });
    const r = s.release(`--commit=${later}`, '--start-candidate');
    expect(r.out).toContain(`✖  the docs' human gates on ${later.slice(0, 7)}: pending`);
    expect(r.out).toContain('npm run wiki -- review-claim bridge-email-unseen-when-away');
    expect(r.out).toContain(`npm run release -- ${V} --commit=${later} --docs-revision`);
    expect(r.out).toContain(`npm run release -- ${V} --commit=<its merge sha> --start-candidate`);
    // The candidate's state said too: it would have been started, but nothing is.
    expect(r.out).toContain(`…  the candidate of ${later.slice(0, 7)}: none on main, the command starts one`);
    expect(r.out).toContain("✖  1 gate refuses (the docs' human gates): nothing was done");
    // Not "run it again": that tree can no longer take a review.
    expect(r.out).toContain(
      `   next: npm run release -- ${V} --commit=${later} --docs-revision, or the reviews merged`,
    );
    expect(sideEffects(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('every red gate in one refusal, not the first one met', () => {
    const s = scratch();
    s.setState({
      runs: { '30': ciRun(s.merge, 'failure', 2) },
      docsPending: PENDING,
      immutable: false,
      npm: { published: [], staged: [] },
    });
    const r = s.release();
    expect(r.out).toMatch(/✖ {2}main's ci on [0-9a-f]{7}: failure again \(attempt 2/);
    expect(r.out).toContain(`✖  the docs' human gates on ${s.merge.slice(0, 7)}: pending`);
    expect(r.out).toContain(`✖  the candidate of ${s.merge.slice(0, 7)}: none on main`);
    expect(r.out).toContain('✖  tag: immutable releases are off');
    expect(r.out).toContain("✖  4 gates refuse (main's ci, the docs' human gates, candidate, tag): nothing was done");
    expect(sideEffects(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
    // The dry run says the same, its exit status the verdict (what a nightly reads).
    const dry = s.release('--dry-run');
    expect(dry.out).toContain('✖  4 gates refuse');
    expect(dry.status).toBe(1);
  }, 120_000);

  it("main's ci red on its first attempt is waited for (ship tag re-runs it once), the re-run said", () => {
    const s = scratch();
    s.setState({
      runs: { '30': ciRun(s.merge, 'failure'), '11': candidate(s.merge, [green]) },
      npm: { published: [], staged: [] },
    });
    const dry = s.release('--dry-run');
    expect(dry.out).toContain(`…  main's ci on ${s.merge.slice(0, 7)}: failure`);
    expect(dry.out).toContain(`gh run rerun 30 --repo ${REPO} --failed`);
    expect(dry.out).toContain("no gate refuses; the command waits for: main's ci");
    expect(dry.status).toBe(0);
  }, 120_000);

  it("4.7.2's superseded candidate: the later green candidate's run and SHA said, its command in full, and it goes through", () => {
    const s = scratch();
    const later = s.git('rev-parse', 'HEAD');
    const superseded = {
      status: 'completed',
      conclusion: 'cancelled',
      jobs: [
        job('target'),
        job('connector-archive-e2e', 'completed', 'failure'),
        job('heavy (1)', 'completed', 'cancelled'),
      ],
    };
    s.setState({
      runs: {
        '11': candidate(s.merge, [superseded]),
        '12': {
          ...candidate(later, [green]),
          event: 'workflow_dispatch',
          createdAt: '2026-10-27T10:00:00Z',
          displayTitle: `candidate ${later}`,
        },
        '20': releaseRun(later),
      },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain(
      `✖  the candidate of ${s.merge.slice(0, 7)}: candidate run 11 was cancelled after connector-archive-e2e failed`,
    );
    expect(r.out).toContain(`A later candidate of ${V} is green on ${later.slice(0, 7)} (run 12`);
    expect(r.out).toContain(`   next: npm run release -- ${V} --commit=${later}`);
    expect(r.out).not.toContain('<its sha>');
    expect(sideEffects(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
    // The command it says, as said: the later commit's candidate tagged.
    const next = s.release(`--commit=${later}`);
    expect(of(next.calls, 'ship')[0]).toBe(`tag ${V} ${later} --candidate=12 --sign --no-watch`);
    expect(next.status).toBe(0);
  }, 180_000);

  // ——— The review of #471.
  const supersededView = {
    status: 'completed',
    conclusion: 'cancelled',
    jobs: [job('target'), job('connector-archive-e2e', 'completed', 'failure')],
  };
  /** The merge's candidate superseded, the commit before main's tip (still at the version) green by hand. */
  const supersededState = (s: ReturnType<typeof scratch>, laterSha: string): State => ({
    runs: {
      '11': candidate(s.merge, [supersededView]),
      '12': {
        ...candidate(laterSha, [green]),
        event: 'workflow_dispatch',
        createdAt: '2026-10-27T10:00:00Z',
        displayTitle: `candidate ${laterSha}`,
      },
    },
    release: releaseJson,
    npm: { published: [], staged: [] },
  });

  it("main's ci red after its re-run refuses with every other gate green: no ship call, exit 1", () => {
    const s = scratch();
    s.setState({
      runs: { '30': ciRun(s.merge, 'failure', 2), '11': candidate(s.merge, [green]), '20': releaseRun(s.merge) },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain("✖  1 gate refuses (main's ci): nothing was done");
    expect(sideEffects(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('immutable releases off refuses with every other gate green: no ship call, exit 1', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [green]), '20': releaseRun(s.merge) },
      immutable: false,
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release();
    expect(r.out).toContain('✖  1 gate refuses (tag): nothing was done');
    expect(sideEffects(r.calls)).toEqual([]);
    expect(r.status).toBe(1);
  }, 120_000);

  it('immutable releases unreadable (no JSON, gh failed) is said so, not read as off', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [green]) },
      immutable: 'unreadable',
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toContain('✖  tag: immutable releases on Quest-n-Click/quest-n-click: unreadable');
    expect(r.out).not.toContain('immutable releases are off');
    expect(r.status).toBe(1);
  }, 120_000);

  it('a candidate view without its jobs is not read: red, said, no crash', () => {
    const s = scratch();
    s.setState({
      runs: { '11': candidate(s.merge, [green]) },
      viewWithoutJobs: true,
      npm: { published: [], staged: [] },
    });
    const r = s.release('--dry-run');
    expect(r.out).toContain(`✖  the candidate of ${s.merge.slice(0, 7)}: not read (unexpected reply`);
    expect(r.out).not.toMatch(/TypeError|is not iterable/);
    expect(r.status).toBe(1);
  }, 120_000);

  it("a dispatch made at main's tip for an older commit is that commit's candidate, never the tip's", () => {
    const s = scratch();
    const tip = s.git('rev-parse', 'HEAD');
    s.setState({
      runs: {
        // Started while `tip` was main's head, testing the merge: its head is the tip, its name the merge.
        '11': {
          ...candidate(tip, [green]),
          event: 'workflow_dispatch',
          displayTitle: `candidate ${s.merge}`,
        },
      },
      npm: { published: [], staged: [] },
    });
    const forTip = s.release(`--commit=${tip}`, '--dry-run');
    expect(forTip.out).toContain(`✖  the candidate of ${tip.slice(0, 7)}: none on main`);
    expect(forTip.status).toBe(1);
    const forMerge = s.release('--dry-run');
    expect(forMerge.out).toContain(`✔  the candidate of ${s.merge.slice(0, 7)}: green (run 11)`);
    expect(forMerge.status).toBe(0);
  }, 120_000);

  it('--commit=<not the tip> --start-candidate finds the run it dispatched (its head is the tip) and tags it', () => {
    const s = scratch();
    const notTip = s.git('rev-parse', 'HEAD~1');
    s.setState({
      runs: { '20': releaseRun(notTip) },
      release: releaseJson,
      npm: { published: [], staged: staged(...PACKAGES) },
    });
    const r = s.release(`--commit=${notTip}`, '--start-candidate');
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('workflow run'))).toHaveLength(1);
    expect(of(r.calls, 'ship')[0]).toBe(`tag ${V} ${notTip} --candidate=77 --sign --no-watch`);
    expect(r.status).toBe(0);
  }, 180_000);

  it('names the later commit next to the release commit even with more than 50 commits of main after it', () => {
    const s = scratch();
    // The first commit of main after the release merge, green by hand; then 55 more merges at the version.
    const later = s.git('rev-list', '--reverse', '--first-parent', `${s.merge}..HEAD`).split('\n')[0]!;
    for (let i = 0; i < 55; i++) s.git('commit', '-q', '--allow-empty', '-m', `later ${i}`);
    s.git('push', '-q', 'upstream', 'main');
    s.setState(supersededState(s, later));
    const r = s.release();
    expect(r.out).toContain(`A later candidate of ${V} is green on ${later.slice(0, 7)} (run 12`);
    expect(r.out).toContain(`   next: npm run release -- ${V} --commit=${later}`);
    expect(r.status).toBe(1);
  }, 120_000);

  it('judges a later commit by its newest candidate only: an older green run under a newer red one is not named', () => {
    const s = scratch();
    const later = s.git('rev-parse', 'HEAD');
    const st = supersededState(s, later);
    st.runs['13'] = {
      // Red after its re-run: the wait would stop on it.
      ...candidate(later, [failed], [failed]),
      attempt: 2,
      event: 'workflow_dispatch',
      createdAt: '2026-10-27T12:00:00Z',
      displayTitle: `candidate ${later}`,
    };
    s.setState(st);
    const r = s.release();
    expect(r.out).not.toContain('(run 12');
    expect(r.out).toContain(`--commit=${later} --start-candidate`);
    expect(r.status).toBe(1);
  }, 120_000);

  it('the next step keeps --docs-revision and --key, and says to fix the other ✖ first when there is one', () => {
    const s = scratch();
    const later = s.git('rev-parse', 'HEAD');
    s.setState({ ...supersededState(s, later), immutable: false });
    const key = join(s.dir, 'key.pub');
    const r = s.release('--docs-revision', `--key=${key}`);
    expect(r.out).toContain(
      `   next: fix the other ✖ above, then npm run release -- ${V} --commit=${later} --key=${key} --docs-revision`,
    );
    expect(r.status).toBe(1);
  }, 120_000);
});

describe.skipIf(!POSIX)("ship main: main's ci, what ship tag waits on (#348)", () => {
  const ci = (sha: string, ...attempts: RunState['attempts']): RunState => ({
    workflow: 'ci',
    headSha: sha,
    headBranch: 'main',
    event: 'push',
    createdAt: '2026-10-26T10:00:00Z',
    attempts,
  });
  const cancelled = { status: 'completed', conclusion: 'cancelled', jobs: [] };
  it('re-runs a cancelled run once, then goes on when it is green', () => {
    const s = scratch();
    s.setState({ runs: { '30': ci(s.merge, [cancelled], [green]) }, npm: { published: [], staged: [] } });
    const r = s.ship('main', s.merge);
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([`run rerun 30 --failed -R ${REPO}`]);
    expect(r.out).toContain('ci run 30: success');
    expect(r.status).toBe(0);
  }, 60_000);
  it('a run re-run already (a relaunch, or by hand) is not re-run again: its second failure is final', () => {
    const s = scratch();
    s.setState({
      runs: { '30': { ...ci(s.merge, [cancelled], [cancelled]), attempt: 2 } },
      npm: { published: [], staged: [] },
    });
    const r = s.ship('main', s.merge);
    expect(of(r.calls, 'gh').filter((c) => c.startsWith('run rerun'))).toEqual([]);
    expect(r.out).toMatch(/run 30 was re-run already \(attempt 2\)/);
    expect(r.out).toMatch(/ci run 30 on .*: cancelled/);
    expect(r.status).toBe(1);
  }, 60_000);
});
