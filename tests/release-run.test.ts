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
