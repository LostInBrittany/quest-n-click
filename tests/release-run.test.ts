// `npm run release -- <x.y.z>` (4.5.4, part D of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md): the maintainer's one command
// after the release pull request's merge. Its pure parts: what it refuses before anything, which candidate run it
// names, how it says a wait's progress, and which staged packages it approves, in which order.
import { describe, expect, it } from 'vitest';
import {
  candidateProgress,
  pickCandidate,
  RELEASE_STEPS,
  releaseRefusals,
  stagedFor,
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

describe('the packages it approves', () => {
  const list = [
    'id: 11111111-0000-0000-0000-000000000001',
    'package name: @quest-n-click/create',
    'version: 4.5.4',
    '',
    'id: 22222222-0000-0000-0000-000000000002',
    'package name: @quest-n-click/engine',
    'version: 4.5.4',
    '',
    'id: 33333333-0000-0000-0000-000000000003',
    'package name: @quest-n-click/bridge',
    'version: 4.5.3',
  ].join('\n');
  it("are this version's, the engine first (create depends on its exact version)", () => {
    expect(stagedFor(list, '4.5.4')).toEqual([
      { id: '22222222-0000-0000-0000-000000000002', name: '@quest-n-click/engine' },
      { id: '11111111-0000-0000-0000-000000000001', name: '@quest-n-click/create' },
    ]);
    expect(stagedFor('No staged packages found.', '4.5.4')).toEqual([]);
  });
});

describe('the steps', () => {
  it('in the order a release takes', () => {
    expect(RELEASE_STEPS).toEqual(['preflight', 'candidate', 'tag and release', 'npm', 'summary']);
  });
});
