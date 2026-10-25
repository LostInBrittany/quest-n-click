// `npm run release -- <x.y.z>` (4.5.4, part D of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md): the maintainer's one command
// after the release pull request's merge. Its pure parts: what it refuses before anything, which candidate run it
// names, how it says a wait's progress, how it judges the release run for npm, and which staged packages it approves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  candidateProgress,
  isCandidateRun,
  pickCandidate,
  RELEASE_STEPS,
  docsGatesStop,
  docsRevisionSteps,
  releaseCommit,
  releaseRefusals,
  releaseRunVerdict,
  stagedFromJson,
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
