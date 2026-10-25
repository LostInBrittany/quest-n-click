// The release's gate in place of the tag's own ci run (4.5.3, #291, D55, tools/release/main-ci.mjs): a tag's commit is
// on main's first-parent line, and main's `ci` succeeded on a push at that very SHA. release.yml starts on the tag's
// push, checks both before anything is downloaded or published, and runs no test of its own; ci.yml no longer runs
// on a tag; `ship tag` always waits for main's run, and `ship watch` for no ci run of the tag.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error: a plain .mjs tool without declarations
import { firstParentProblem, mainCiProblem } from '../tools/release/main-ci.mjs';

const SHA = 'a'.repeat(40);
const run = (over: Record<string, unknown> = {}) => ({
  id: 1,
  head_sha: SHA,
  event: 'push',
  head_branch: 'main',
  path: '.github/workflows/ci.yml',
  status: 'completed',
  conclusion: 'success',
  ...over,
});

describe("main's ci on the SHA", () => {
  it('passes on one green run of a push of main at that SHA, whatever else is listed', () => {
    expect(mainCiProblem([run()], SHA)).toBeUndefined();
    expect(mainCiProblem([run({ id: 2, conclusion: 'failure' }), run({ id: 3 })], SHA)).toBeUndefined();
  });

  it('refuses no run, a run still going, a red or cancelled one, and says which', () => {
    expect(mainCiProblem([], SHA)).toMatch(/has not succeeded on aaaaaaaaaaaa \(no ci run of a push of main/);
    expect(mainCiProblem(undefined, SHA)).toMatch(/no ci run/);
    expect(mainCiProblem([run({ status: 'in_progress', conclusion: null })], SHA)).toMatch(
      /run 1: in_progress\): wait for it, then re-run this job/,
    );
    expect(mainCiProblem([run({ conclusion: 'failure' }), run({ id: 2, conclusion: 'cancelled' })], SHA)).toMatch(
      /run 1: failure, run 2: cancelled/,
    );
  });

  it("never counts a pull request's run, another branch's, another commit's or another workflow's", () => {
    for (const other of [
      { event: 'pull_request' },
      { event: 'workflow_dispatch' },
      { head_branch: 'v4.5.3' },
      { head_branch: 'feature/x' },
      { head_sha: 'b'.repeat(40) },
      { path: '.github/workflows/nightly.yml' },
    ])
      expect(mainCiProblem([run(other)], SHA), JSON.stringify(other)).toMatch(/has not succeeded/);
  });
});

const dir = mkdtempSync(join(tmpdir(), 'ws-main-ci-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();
let n = 0;
const commit = (msg: string) => {
  const f = `f${n++}`;
  writeFileSync(join(dir, f), msg);
  git('add', f);
  git('commit', '-q', '-m', msg);
  return git('rev-parse', 'HEAD');
};

describe("main's first-parent line", () => {
  it('holds main and its merges, never a topic commit merged in, nor one never merged', () => {
    git('init', '-q', '-b', 'main');
    const base = commit('base');
    git('checkout', '-q', '-b', 'topic');
    const topic = commit('topic');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'merge topic', 'topic');
    const merge = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-b', 'side');
    const side = commit('side, never merged');
    git('checkout', '-q', 'main');
    const opts = { main: 'refs/heads/main', cwd: dir };
    expect(firstParentProblem(base, opts)).toBeUndefined();
    expect(firstParentProblem(merge, opts)).toBeUndefined();
    // Reachable from main, but only through a merge's second parent: a topic branch's commit, never a release's.
    expect(firstParentProblem(topic, opts)).toMatch(/is not on main's first-parent line/);
    expect(firstParentProblem(side, opts)).toMatch(/is not on main's first-parent line/);
    expect(firstParentProblem('abc', opts)).toMatch(/not a full SHA/);
    expect(firstParentProblem(base, { main: 'refs/heads/nothing', cwd: dir })).toMatch(/rev-list --first-parent/);
  });
});

describe('release.yml on the tag push', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  const job = release.slice(release.indexOf('\n  release:'), release.indexOf('\n  npm-stage:'));

  it("checks main's ci on the SHA after the checkout and before anything is downloaded or published", () => {
    const step = job.slice(job.indexOf("- name: Main's ci passed on this commit"));
    expect(step).toMatch(
      /git fetch --force --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main\n\s+node tools\/release\/main-ci\.mjs "\$SHA" --main=refs\/remotes\/origin\/main --repo="\$GITHUB_REPOSITORY"/,
    );
    expect(step.slice(0, step.indexOf('\n      - '))).toContain('GH_TOKEN: ${{ github.token }}');
    const at = (s: string) => job.indexOf(s);
    expect(at('fetch-depth: 0')).toBeLessThan(at("Main's ci passed on this commit"));
    expect(at('The tag is the commit this run was started for')).toBeLessThan(at("Main's ci passed on this commit"));
    for (const later of ['The candidate this tag stands on', 'Not published yet', 'gh release create'])
      expect(at("Main's ci passed on this commit"), later).toBeLessThan(at(later));
    // The token reads Actions runs: main's ci and the candidate's files.
    expect(release).toMatch(/^permissions:\n(?: {2}.+\n)*? {2}actions: read$/m);
  });

  it('runs no test suite and installs no python, ffmpeg or browser', () => {
    // The code, not the comments that say what moved where.
    const code = release
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    expect(code).not.toMatch(/release-check/);
    expect(code).not.toMatch(/setup-python|pip install|ffmpeg|playwright install/);
    // What still runs: the release notes, the reference speedrun's verification, the manifest's check, ship verify.
    for (const s of [
      'node scripts/release-notes.mjs "$TAG" > notes.md',
      'npm run -s speedrun:verify',
      'tools/release/artifacts.mjs check-release',
      'node tools/release/ship.mjs verify "$TAG"',
    ])
      expect(job).toContain(s);
  });

  it('hands docs-publish and npm-stage the tag and its commit from the push, OIDC kept for staging', () => {
    const stage = release.slice(release.indexOf('\n  npm-stage:'), release.indexOf('\n  docs-publish:'));
    expect(stage).toMatch(/^ {6}TAG: \$\{\{ github\.ref_name \}\}$/m);
    expect(stage).toMatch(/^ {6}SHA: \$\{\{ github\.sha \}\}$/m);
    expect(stage).toMatch(/permissions:\n {6}contents: read\n {6}id-token: write\n/);
    const docs = release.slice(release.indexOf('\n  docs-publish:'), release.indexOf('\n  site-revalidate:'));
    expect(docs).toMatch(/^ {6}sha: \$\{\{ github\.sha \}\}$/m);
    expect(release).not.toMatch(/github\.event\.workflow_run/);
  });
});

describe('the tag runs no ci; ship waits for main', () => {
  it('ci.yml runs on main, pull requests and by hand, never on a tag', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const on = ci.slice(ci.indexOf('\non:\n'), ci.indexOf('\npermissions:'));
    expect(on).toMatch(/^ {4}branches: \[main\]$/m);
    expect(on).not.toMatch(/tags:/);
  });

  it('ship tag refuses --now and always waits for main; ship watch waits for no ci run of the tag', () => {
    const ship = readFileSync('tools/release/ship.mjs', 'utf8');
    const tag = ship.slice(ship.indexOf('async function tag('), ship.indexOf('async function watch('));
    expect(tag).toMatch(/if \(process\.argv\.includes\('--now'\)\)\n\s+throw new Error\(\s*`--now is gone/);
    expect(tag.indexOf("includes('--now')")).toBeLessThan(tag.indexOf("git(['fetch'"));
    expect(tag).toMatch(/\n\s+await main\(full\);\n/);
    const watch = ship.slice(ship.indexOf('async function watch('), ship.indexOf('async function verify('));
    expect(watch).not.toMatch(/waitRun\('ci'/);
    expect(watch).toContain("'release'");
  });
});

// Every commit of main keeps its own ci result (4.5.5, #337): any of them may become a release commit, whose tag needs
// main's run on that SHA. 4.5.4's (47dccf1) was cancelled by the next merge and `ship tag` re-ran it. In one group
// GitHub cancels a running run (cancel-in-progress) and also a pending one (always), so a main push needs a group of
// its own. The workflow's top-level `concurrency:` is read and its two expressions evaluated for each event.
describe("main's runs are never cancelled (#337)", () => {
  type Ctx = Record<string, string>;
  /** A GitHub expression of the forms the workflows use: paths, 'literals', ==, !=, && and || (left to right). */
  const evaluate = (expr: string, ctx: Ctx): string | boolean => {
    const or = expr.split(' || ');
    if (or.length > 1) {
      for (const part of or) {
        const v = evaluate(part, ctx);
        if (v) return v;
      }
      return evaluate(or.at(-1)!, ctx);
    }
    const and = expr.split(' && ');
    if (and.length > 1) {
      let v: string | boolean = true;
      for (const part of and) if (!(v = evaluate(part, ctx))) return v;
      return v;
    }
    const cmp = /^(.+?) (==|!=) (.+)$/.exec(expr);
    if (cmp) return (evaluate(cmp[1]!, ctx) === evaluate(cmp[3]!, ctx)) === (cmp[2] === '==');
    const lit = /^'(.*)'$/.exec(expr);
    if (lit) return lit[1]!;
    if (expr === 'true' || expr === 'false') return expr === 'true';
    return ctx[expr] ?? '';
  };
  /** The top-level concurrency of a workflow, for one event: its group and whether it cancels the run in progress. */
  const concurrency = (workflow: string, ctx: Ctx) => {
    const text = readFileSync(`.github/workflows/${workflow}`, 'utf8');
    const block = /^concurrency:\n((?: {2}.*\n)+)/m.exec(text)![1]!;
    const value = (key: string) => new RegExp(`^ {2}${key}: (.+)$`, 'm').exec(block)![1]!.trim();
    const render = (v: string) => v.replace(/\$\{\{ (.+?) \}\}/g, (_, e: string) => String(evaluate(e, ctx)));
    return { group: render(value('group')), cancel: render(value('cancel-in-progress')) === 'true' };
  };
  const push = (sha: string): Ctx => ({
    'github.event_name': 'push',
    'github.ref': 'refs/heads/main',
    'github.sha': sha,
  });
  const pr = (sha: string): Ctx => ({
    'github.event_name': 'pull_request',
    'github.ref': 'refs/pull/7/merge',
    'github.sha': sha,
    'github.event.pull_request.number': '7',
  });
  const dispatch: Ctx = {
    'github.event_name': 'workflow_dispatch',
    'github.ref': 'refs/heads/main',
    'github.sha': 'c',
  };

  for (const workflow of ['ci.yml', 'qualify.yml']) {
    it(`${workflow}: two pushes of main never share a group, and none cancels`, () => {
      const [a, b] = [concurrency(workflow, push('a'.repeat(40))), concurrency(workflow, push('b'.repeat(40)))];
      expect(a.group).not.toBe(b.group);
      expect(a.cancel || b.cancel).toBe(false);
    });
    it(`${workflow}: a pull request's newer push still cancels the run it supersedes`, () => {
      const [a, b] = [concurrency(workflow, pr('a'.repeat(40))), concurrency(workflow, pr('b'.repeat(40)))];
      expect(a.group).toBe(b.group);
      expect(b.cancel).toBe(true);
    });
  }
  it('ci.yml: a run started by hand cancels nothing, and shares no group with a push of main', () => {
    const run = concurrency('ci.yml', dispatch);
    expect(run.cancel).toBe(false);
    expect(run.group).not.toBe(concurrency('ci.yml', push('c')).group);
  });
});
