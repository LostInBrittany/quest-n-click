// `npm run release -- <x.y.z>` (4.5.4, part D of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md): the maintainer's one command
// after the release pull request's merge. Its pure parts: what it refuses before anything, which candidate run it
// names, how it says a wait's progress, how it judges the release run for npm, and which staged packages it approves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_DEADLINE_MS,
  candidateProgress,
  commitLine,
  commitRefusals,
  releaseCommand,
  candidateStep,
  isCandidateRun,
  pickCandidate,
  RELEASE_STEPS,
  docsGatesStop,
  docsRevisionSteps,
  releaseCommit,
  releaseRefusals,
  releaseRunVerdict,
  stagedFromJson,
  verifiedState,
  verifySkip,
} from '../tools/release/release-run';

const SHA = 'a'.repeat(40);

describe('what npm run release -- <version> refuses first', () => {
  const ok = {
    version: '4.5.4',
    current: '4.5.4',
    branch: 'main',
    dirty: false,
    upToDate: true,
    section: true,
    signing: true,
    gh: true,
    npm: 'lostinbrittany',
    owners: ['lostinbrittany', 'wanoo'],
    npmVersion: '11.19.1',
    signer: true,
  };
  it('nothing when main is the merged release, signed, signed in to gh and to npm as an owner', () => {
    expect(releaseRefusals(ok)).toEqual([]);
  });
  it('each thing to fix, with what to do', () => {
    expect(releaseRefusals({ ...ok, current: '4.5.3' })).toEqual([
      expect.stringMatching(/package\.json is at 4\.5\.3.*merge the release pull request/),
    ]);
    expect(releaseRefusals({ ...ok, branch: 'release/4.5.4' })).toEqual([expect.stringMatching(/on main/)]);
    expect(releaseRefusals({ ...ok, dirty: true })).toEqual([expect.stringMatching(/uncommitted/)]);
    expect(releaseRefusals({ ...ok, upToDate: false })).toEqual([expect.stringMatching(/git pull/)]);
    expect(releaseRefusals({ ...ok, section: false })).toEqual([expect.stringMatching(/## 4\.5\.4/)]);
    expect(releaseRefusals({ ...ok, signing: false })).toEqual([expect.stringMatching(/gpg\.format ssh/)]);
    expect(releaseRefusals({ ...ok, gh: false })).toEqual([expect.stringMatching(/gh auth login/)]);
    expect(releaseRefusals({ ...ok, npm: undefined })).toEqual([expect.stringMatching(/npm login/)]);
    expect(releaseRefusals({ ...ok, npm: 'someone' })).toEqual([expect.stringMatching(/not an owner/)]);
    expect(releaseRefusals({ ...ok, npmVersion: '10.9.0' })).toEqual([
      expect.stringMatching(/npm 10\.9\.0.*11\.15\.0/),
    ]);
    expect(releaseRefusals({ ...ok, signer: false })).toEqual([expect.stringMatching(/allowed_signers/)]);
  });
});

describe("the docs' human gates on the release commit (#339)", () => {
  const pending = {
    ok: false,
    detail:
      "✖  create.review-pages: the claim import-layout-merges's scope is self-checked by the author (AI), not reviewed: a person reads it, then npm run wiki -- review-claim import-layout-merges --by <name> --kind human --relation independent",
  };
  it('says nothing when they pass', () => {
    expect(docsGatesStop({ version: '4.5.4', sha: SHA, gates: { ok: true, detail: '' }, docsRevision: false })).toBe(
      undefined,
    );
  });
  it('stops before the tag with each pending item, its command, and the one way on', () => {
    const stop = docsGatesStop({ version: '4.5.4', sha: SHA, gates: pending, docsRevision: false })!;
    expect(stop).toMatch(/aaaaaaa/);
    expect(stop).toContain('npm run wiki -- review-claim import-layout-merges');
    expect(stop).toMatch(/nothing is tagged/);
    expect(stop).toContain('npm run release -- 4.5.4 --docs-revision');
    for (const step of docsRevisionSteps('4.5.4')) expect(stop).toContain(step);
  });
  it('lets the release go on with --docs-revision, the docs to follow as a revision', () => {
    expect(docsGatesStop({ version: '4.5.4', sha: SHA, gates: pending, docsRevision: true })).toBe(undefined);
  });
  it('a revision is made from docs/<v>, cut from the tag, and published by docs-publish by hand', () => {
    const steps = docsRevisionSteps('4.5.4');
    expect(steps[0]).toBe('git switch -c docs/4.5.4 v4.5.4');
    expect(steps.at(-1)).toBe('gh workflow run docs-publish --ref docs/4.5.4 -f mode=revision -f version=4.5.4');
    // docs-publish.yml accepts a revision from refs/heads/docs/<v> only.
    expect(readFileSync('.github/workflows/docs-publish.yml', 'utf8')).toContain(
      'revision) want="refs/heads/docs/$VERSION" ;;',
    );
  });
  it("runRelease judges the release commit's own tree, before the candidate is waited for, unless the tag is out", () => {
    const src = readFileSync('tools/release/release-run.ts', 'utf8');
    const run = src.slice(src.indexOf('export async function runRelease('));
    expect(run.indexOf('gatesAt(sha)')).toBeGreaterThan(0);
    expect(run.indexOf('gatesAt(sha)')).toBeLessThan(run.indexOf('await waitForCandidate('));
    expect(run).toMatch(/tagged\s*\?\s*undefined\s*:\s*docsGatesStop\(/);
    const gatesAt = src.slice(src.indexOf('function gatesAt('), src.indexOf('export async function runRelease('));
    expect(gatesAt).toMatch(/'worktree', 'add', '--detach'/);
    expect(gatesAt).toMatch(/humanGates\(/);
    expect(gatesAt).toMatch(/finally/);
    expect(readFileSync('tools/release/prepare.ts', 'utf8')).toMatch(
      /docsRevision: all\.includes\('--docs-revision'\)/,
    );
  });
});

describe('the candidate it names', () => {
  const run = (o: Record<string, unknown>) => ({
    databaseId: 1,
    event: 'push',
    headBranch: 'main',
    headSha: SHA,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-10-26T10:00:00Z',
    ...o,
  });
  it("is the newest run of the release commit started on main, the release merge's or one by hand", () => {
    expect(
      pickCandidate(
        [
          run({ databaseId: 1, createdAt: '2026-10-26T09:00:00Z', conclusion: 'failure' }),
          run({ databaseId: 2, event: 'workflow_dispatch', createdAt: '2026-10-26T11:00:00Z' }),
          run({ databaseId: 3, event: 'pull_request', createdAt: '2026-10-26T12:00:00Z' }),
          run({ databaseId: 4, headSha: 'b'.repeat(40), createdAt: '2026-10-26T13:00:00Z' }),
        ],
        SHA,
      )?.databaseId,
    ).toBe(2);
  });
  it('is none when no run of that commit was started on main', () => {
    expect(pickCandidate([run({ headBranch: 'release/4.5.4' })], SHA)).toBeUndefined();
    expect(pickCandidate([], SHA)).toBeUndefined();
  });
});

describe('a wait says where it is', () => {
  it('jobs done out of all, those running, those failed', () => {
    expect(
      candidateProgress([
        { name: 'target', status: 'completed', conclusion: 'success' },
        { name: 'heavy (1)', status: 'in_progress', conclusion: '' },
        { name: 'pack', status: 'completed', conclusion: 'failure' },
        { name: 'image', status: 'queued', conclusion: '' },
      ]),
    ).toBe('2/4 jobs done · running: heavy (1) · waiting: 1 · failed: pack');
    expect(candidateProgress([{ name: 'target', status: 'completed', conclusion: 'success' }])).toBe('1/1 jobs done');
  });
});

describe('the steps', () => {
  it('in the order a release takes', () => {
    expect(RELEASE_STEPS).toEqual(['preflight', 'candidate', 'tag and release', 'npm', 'summary']);
  });
});

describe('the release commit (4.5.4)', () => {
  it('is where package.json became the version on main, whatever was merged after it', () => {
    const history = [
      { sha: 'c', version: '4.5.4' },
      { sha: 'b', version: '4.5.4' },
      { sha: 'a', version: '4.5.3' },
    ];
    expect(releaseCommit(history, '4.5.4')).toBe('b');
    expect(releaseCommit(history, '4.5.5')).toBeUndefined();
    expect(releaseCommit([{ sha: 'x', version: '4.5.4' }], '4.5.4')).toBe('x');
  });
});

describe('--commit=<sha>: a later commit of main in place of the release merge (4.5.6)', () => {
  const MERGE = 'c'.repeat(40);
  const LATER = 'b'.repeat(40);
  const ok = {
    version: '4.5.5',
    given: LATER,
    resolved: LATER,
    firstParent: true,
    versionAt: '4.5.5',
    found: MERGE,
    descends: true,
    tagged: undefined,
  };
  it('nothing when it is the release merge or a later commit of main still at the version', () => {
    expect(commitRefusals(ok)).toEqual([]);
    expect(commitRefusals({ ...ok, given: MERGE, resolved: MERGE })).toEqual([]);
    expect(commitRefusals({ ...ok, given: 'bbbbbbb' })).toEqual([]);
  });
  it('each thing to fix, with what to do', () => {
    expect(commitRefusals({ ...ok, given: 'main', resolved: undefined })).toEqual([
      expect.stringMatching(/--commit=main is not a commit SHA.*git fetch/),
    ]);
    expect(commitRefusals({ ...ok, resolved: undefined })).toEqual([
      expect.stringMatching(/--commit=b{40} is not a commit SHA.*git fetch/),
    ]);
    expect(commitRefusals({ ...ok, firstParent: false })).toEqual([
      expect.stringMatching(/bbbbbbb is not on main's first-parent line.*git log --first-parent/),
    ]);
    expect(commitRefusals({ ...ok, versionAt: '4.5.6' })).toEqual([
      expect.stringMatching(/package\.json is at 4\.5\.6 on bbbbbbb, not 4\.5\.5/),
    ]);
    expect(commitRefusals({ ...ok, descends: false })).toEqual([
      expect.stringMatching(/bbbbbbb does not come after the release merge ccccccc/),
    ]);
  });
  it('once the tag is out, only its commit: a tag never moves', () => {
    expect(commitRefusals({ ...ok, tagged: LATER })).toEqual([]);
    expect(commitRefusals({ ...ok, tagged: MERGE })).toEqual([
      expect.stringMatching(/v4\.5\.5 is tagged on ccccccc already.*without --commit/),
    ]);
  });
  it('says which commit is used, and that it is not the release merge when it is not', () => {
    expect(commitLine(MERGE, MERGE)).toBe('release commit ccccccc');
    expect(commitLine(MERGE, LATER)).toBe(
      'release commit bbbbbbb (--commit: a later commit of main, not the release merge ccccccc)',
    );
  });
  it('a stop says the command to run again, --commit kept', () => {
    expect(releaseCommand('4.5.5')).toBe('npm run release -- 4.5.5');
    expect(releaseCommand('4.5.5', LATER)).toBe(`npm run release -- 4.5.5 --commit=${LATER}`);
    const pending = { ok: false, detail: 'x' };
    expect(
      docsGatesStop({ version: '4.5.5', sha: LATER, gates: pending, docsRevision: false, commit: LATER }),
    ).toContain(`npm run release -- 4.5.5 --commit=${LATER} --docs-revision`);
    const view = { status: 'in_progress', conclusion: '', jobs: [] };
    const stop = candidateStep(view, {
      id: 1,
      version: '4.5.5',
      rerunAsked: false,
      waitedMs: CANDIDATE_DEADLINE_MS,
      commit: LATER,
    });
    expect(stop.do === 'stop' && stop.error).toContain(`npm run release -- 4.5.5 --commit=${LATER} again`);
  });
  it('the CLI passes --commit= on, and runRelease uses it in place of the found commit', () => {
    expect(readFileSync('tools/release/prepare.ts', 'utf8')).toMatch(/startsWith\('--commit='\)/);
    const src = readFileSync('tools/release/release-run.ts', 'utf8');
    const run = src.slice(src.indexOf('export async function runRelease('));
    expect(run.indexOf('commitRefusals(')).toBeGreaterThan(0);
    expect(run.indexOf('commitRefusals(')).toBeLessThan(run.indexOf('gatesAt(sha)'));
  });
});

describe('a candidate run (4.5.4)', () => {
  it('is one whose target ran: a push that was no release skips it and is no candidate', () => {
    expect(isCandidateRun([{ name: 'target', status: 'completed', conclusion: 'success' }])).toBe(true);
    expect(isCandidateRun([{ name: 'target', status: 'in_progress', conclusion: '' }])).toBe(true);
    expect(isCandidateRun([{ name: 'target', status: 'completed', conclusion: 'skipped' }])).toBe(false);
    expect(isCandidateRun([{ name: 'release-merge', status: 'completed', conclusion: 'success' }])).toBe(false);
  });
});

describe('the release run, judged for npm (4.5.4)', () => {
  const job = (name: string, status: string, conclusion = '') => ({ name, status, conclusion });
  it('is ready for npm when release and npm-stage succeeded, the docs said apart', () => {
    expect(
      releaseRunVerdict([
        job('release', 'completed', 'success'),
        job('npm-stage', 'completed', 'success'),
        job('docs-publish / publish', 'completed', 'failure'),
        job('site-revalidate', 'completed', 'skipped'),
      ]),
    ).toEqual({ state: 'ready', warnings: ['docs-publish / publish: failure', 'site-revalidate: skipped'] });
    expect(releaseRunVerdict([job('release', 'in_progress'), job('npm-stage', 'queued')]).state).toBe('waiting');
    expect(
      releaseRunVerdict([job('release', 'completed', 'success'), job('npm-stage', 'completed', 'failure')]),
    ).toEqual({
      state: 'failed',
      warnings: [],
      failed: ['npm-stage: failure'],
    });
  });
});

describe('npm stage list --json (4.5.4)', () => {
  it("reads npm 11's items, this version's only, the engine first", () => {
    const json = JSON.stringify([
      { id: 'c1', packageName: '@quest-n-click/create', version: '4.5.4' },
      { id: 'e1', packageName: '@quest-n-click/engine', version: '4.5.4' },
      { id: 'b0', packageName: '@quest-n-click/bridge', version: '4.5.3' },
    ]);
    expect(stagedFromJson(json, '4.5.4')).toEqual([
      { id: 'e1', name: '@quest-n-click/engine' },
      { id: 'c1', name: '@quest-n-click/create' },
    ]);
    expect(stagedFromJson('[]', '4.5.4')).toEqual([]);
  });
});

describe('ship tag for the release command (4.5.4)', () => {
  it('can stop after the push (--no-watch): the command follows the release run itself', () => {
    expect(readFileSync('tools/release/ship.mjs', 'utf8')).toContain(
      "if (process.argv.includes('--no-watch')) return;",
    );
  });
});

describe('the release commit is looked for on main itself (4.5.5)', () => {
  it("follows main's first parents: the release branch's own commits never count", () => {
    // 4.5.4: without --first-parent the walk went down the merged release branch and named the prepare commit, not the
    // merge the candidate ran on ("no candidate of 1d3d98c on main").
    expect(readFileSync('tools/release/release-run.ts', 'utf8')).toMatch(
      /quiet\('git',\s*\[\s*'log',\s*'--first-parent',\s*'--format=%H',[^\]]*'package\.json',?\s*\]/,
    );
  });
});

describe('ship verify once per release, on a resumed run (#343)', () => {
  const TAG = 't'.repeat(40);
  const release = (o: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: 7,
      immutable: true,
      assets: [
        { name: 'quest-n-click-4.5.4.tgz', digest: 'sha256:aa' },
        { name: 'quest-n-click-v4.5.4-SHA256SUMS', digest: 'sha256:bb' },
      ],
      ...o,
    });
  const lsRemote = `${TAG}\trefs/tags/v4.5.4\n${SHA}\trefs/tags/v4.5.4^{}\n`;
  const now = verifiedState(release(), lsRemote, '4.5.4');
  const record = { ...now, at: '2026-10-25T23:10:00.000Z' };

  it('reads the tag object, its commit, the release and its assets, sorted', () => {
    expect(now).toEqual({
      tag: TAG,
      commit: SHA,
      release: 7,
      immutable: true,
      assets: [
        { name: 'quest-n-click-4.5.4.tgz', digest: 'sha256:aa' },
        { name: 'quest-n-click-v4.5.4-SHA256SUMS', digest: 'sha256:bb' },
      ],
    });
    const shuffled = verifiedState(
      release({
        assets: [
          { name: 'b', digest: 'sha256:2' },
          { name: 'a', digest: 'sha256:1' },
        ],
      }),
      lsRemote,
      '4.5.4',
    );
    expect(shuffled.assets.map((a) => a.name)).toEqual(['a', 'b']);
  });
  it('skips only when everything verified is still exactly there, and says when and what', () => {
    const v = verifySkip(record, now, false);
    expect(v.skip).toBe(true);
    expect(v.line).toBe(
      'verify: already passed at 2026-10-25T23:10:00.000Z for tag tttttttttttt, release 7, 2 assets unchanged – skipped (--reverify to run it again)',
    );
  });
  it('verifies again on --reverify, without a record, or when anything moved, and says why', () => {
    const again = (r: typeof record | undefined, n: typeof now, force = false) => {
      const v = verifySkip(r, n, force);
      expect(v.skip).toBe(false);
      return v.line;
    };
    expect(again(record, now, true)).toMatch(/--reverify/);
    expect(again(undefined, now)).toMatch(/no record of a passed verify/);
    expect(again(record, { ...now, tag: 'x'.repeat(40) })).toMatch(/the tag/);
    expect(again(record, { ...now, commit: 'c'.repeat(40) })).toMatch(/the tag/);
    expect(again(record, { ...now, release: 8 })).toMatch(/the release/);
    expect(again(record, { ...now, immutable: false })).toMatch(/not immutable/);
    expect(again(record, { ...now, assets: [now.assets[0]!, { ...now.assets[1]!, digest: 'sha256:cc' }] })).toMatch(
      /the assets/,
    );
    expect(again(record, { ...now, assets: [now.assets[0]!] })).toMatch(/the assets/);
    const noDigest = { ...now, assets: [now.assets[0]!, { ...now.assets[1]!, digest: null }] };
    expect(again({ ...noDigest, at: record.at }, noDigest)).toMatch(/digest/);
  });
  it('an untagged release or one with no assets reads as nothing to skip on', () => {
    expect(verifiedState(release({ assets: [] }), '', '4.5.4')).toMatchObject({ tag: '', commit: '', assets: [] });
    expect(verifySkip({ ...record, tag: '' }, { ...now, tag: '' }, false).skip).toBe(false);
    expect(verifySkip({ ...record, assets: [] }, { ...now, assets: [] }, false).skip).toBe(false);
  });
  it('runRelease verifies through verifyOnce, its record beside the download folder, never inside it', () => {
    const src = readFileSync('tools/release/release-run.ts', 'utf8');
    const run = src.slice(src.indexOf('export async function runRelease('));
    expect(run).not.toMatch(/'ship\.mjs', 'verify'/);
    expect(run).toMatch(/await verifyOnce\(version, process\.argv\.includes\('--reverify'\)\)/);
    const once = src.slice(src.indexOf('async function verifyOnce('), src.indexOf('export async function runRelease('));
    expect(once).toMatch(/`v\$\{version\}\.verified\.json`/);
    // Read before and after the verify: the record is written only when nothing moved in between.
    expect(once.indexOf('const before = ')).toBeLessThan(once.indexOf("'verify', version"));
    expect(once.indexOf("'verify', version")).toBeLessThan(once.indexOf('writeFileSync('));
  });
});

describe('the candidate wait: a deadline, one re-run that a relaunch keeps, what a cancelled run says (#348)', () => {
  const job = (name: string, status: string, conclusion = '') => ({ name, status, conclusion });
  const view = (o: Record<string, unknown>) => ({
    status: 'completed',
    conclusion: 'failure',
    attempt: 1,
    jobs: [job('target', 'completed', 'success'), job('heavy (2)', 'completed', 'failure')],
    ...o,
  });
  const at = { id: 42, version: '4.5.5', rerunAsked: false, waitedMs: 0 };
  it('gives up after three hours, says where the run is and how to resume', () => {
    expect(CANDIDATE_DEADLINE_MS).toBe(180 * 60_000);
    const running = view({ status: 'in_progress', conclusion: '', jobs: [job('heavy (1)', 'in_progress')] });
    expect(candidateStep(running, { ...at, waitedMs: CANDIDATE_DEADLINE_MS - 1 })).toEqual({ do: 'wait' });
    const stop = candidateStep(running, { ...at, waitedMs: CANDIDATE_DEADLINE_MS });
    expect(stop.do).toBe('stop');
    if (stop.do !== 'stop') return;
    expect(stop.error).toMatch(/candidate run 42 not done after 180 min \(0\/1 jobs done · running: heavy \(1\)\)/);
    expect(stop.error).toContain('https://github.com/Quest-n-Click/quest-n-click/actions/runs/42');
    expect(stop.error).toContain('npm run release -- 4.5.5');
  });
  it('is done on a green run', () => {
    expect(candidateStep(view({ conclusion: 'success' }), at)).toEqual({ do: 'done' });
  });
  it("re-runs a first attempt's failed jobs once, naming them", () => {
    expect(candidateStep(view({}), at)).toEqual({
      do: 'rerun',
      args: ['run', 'rerun', '42', '--repo', 'Quest-n-Click/quest-n-click', '--failed'],
      line: 'candidate failure (heavy (2) failure): re-running its failed jobs once',
    });
  });
  it('re-runs a run cancelled before any job failed whole, and never says an empty list', () => {
    const cancelled = view({ conclusion: 'cancelled', jobs: [job('target', 'completed', 'success')] });
    const step = candidateStep(cancelled, at);
    expect(step).toEqual({
      do: 'rerun',
      args: ['run', 'rerun', '42', '--repo', 'Quest-n-Click/quest-n-click'],
      line: 'candidate cancelled before any job failed: re-running the whole run once',
    });
    expect(JSON.stringify(step)).not.toContain('()');
    expect(candidateStep(view({ conclusion: 'cancelled', jobs: [] }), at).do).toBe('rerun');
  });
  it('stops on a second attempt that failed, whoever re-ran it: the budget is the run’s, not the process’s', () => {
    const again = candidateStep(view({ attempt: 2 }), at);
    expect(again.do).toBe('stop');
    if (again.do !== 'stop') return;
    expect(again.error).toMatch(/candidate run 42 failed again \(attempt 2\): heavy \(2\) failure/);
    const cancelled = candidateStep(view({ attempt: 2, conclusion: 'cancelled', jobs: [] }), at);
    expect(cancelled.do === 'stop' && cancelled.error).toMatch(/cancelled again \(attempt 2\): no job failed/);
  });
  it('waits for the attempt it asked for while GitHub still shows the old one', () => {
    expect(candidateStep(view({}), { ...at, rerunAsked: true })).toEqual({ do: 'wait' });
  });
  it('waitForCandidate asks gh for the attempt and decides through candidateStep', () => {
    const src = readFileSync('tools/release/release-run.ts', 'utf8');
    const wait = src.slice(
      src.indexOf('async function waitForCandidate('),
      src.indexOf('async function followRelease('),
    );
    expect(wait).toContain("'status,conclusion,jobs,attempt'");
    expect(wait).toContain('candidateStep(');
    expect(wait).not.toMatch(/let rerun = false/);
  });
});

describe('the dispatch from prepare.ts (#348)', () => {
  it("release-run never imports prepare: prepare's top-level await of release-run would never settle", () => {
    // 4.5.5 (#341) imported humanGates from ./prepare: `npm run release -- <version>` exited at once, saying nothing but
    // "Detected unsettled top-level await". The end-to-end test (tests/release-command.test.ts) runs the dispatch.
    const src = readFileSync('tools/release/release-run.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\/prepare'/);
    expect(readFileSync('tools/release/prepare.ts', 'utf8')).toContain("await import('./release-run')");
  });
});
