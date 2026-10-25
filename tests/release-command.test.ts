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
  attempts: { status: string; conclusion: string; jobs: { name: string; status: string; conclusion: string }[] }[][];
  attempt?: number;
  seen?: number;
  /** Listed only once this tag is on the remote (a release run starts on the tag's push). */
  afterTag?: string;
}
interface State {
  runs: Record<string, RunState>;
  release?: unknown;
  npm: { published: string[]; staged: { id: string; packageName: string; version: string }[] };
  ship?: { tagExit?: number; verifyExit?: number };
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
  createdAt: r.createdAt, ...(({ status, conclusion }) => ({ status, conclusion }))(view(id)) });
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
// The docs' human gates (humanGates): they hold.
else if (a === 'run' && args.includes('--reviews-only')) out('✔  0 error(s)');
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
  const setState = (s: State) => writeFileSync(state, JSON.stringify(s, null, 2));
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

const job = (name: string, status = 'completed', conclusion = 'success') => ({ name, status, conclusion });
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
