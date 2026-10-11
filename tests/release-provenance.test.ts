// tools/release/provenance.mjs (4.1.19, plan §6.5): the one contract `ship` and the Field Kit verify a candidate with.
// The manifest read strictly, files against its digests, the run an attestation names, and what makes a run one a tag
// or a pass may stand on. The GitHub calls themselves are field-kit.test.ts's (a stand-in `gh`) and ship's.
import { describe, expect, it } from 'vitest';
import {
  candidateRunProblem,
  digestProblems,
  readCandidateManifest,
  runOfStatement,
  sha256,
  // @ts-expect-error: a plain .mjs module without declarations
} from '../tools/release/provenance.mjs';

const m = {
  format: 'web-scumm-candidate',
  schema: 1,
  sha: 'a'.repeat(40),
  candidateRunId: '42',
  createdAt: 'x',
  artifacts: [
    { name: 'pack/web-scumm-4.1.19.tgz', sha256: sha256(Buffer.from('engine')) },
    { name: 'image/web-scumm-bridge-image.json', sha256: sha256(Buffer.from('image')) },
  ],
};

describe('provenance', () => {
  it('reads a candidate manifest strictly', () => {
    expect(readCandidateManifest(JSON.stringify(m)).candidateRunId).toBe('42');
    for (const bad of [
      { ...m, schema: 2 },
      { ...m, sha: 'abc' },
      { ...m, candidateRunId: 'x' },
      { ...m, artifacts: [{ name: 'a', sha256: 'z' }] },
    ])
      expect(() => readCandidateManifest(JSON.stringify(bad))).toThrow(/not a candidate manifest/);
    expect(() => readCandidateManifest('{')).toThrow(/not JSON/);
  });

  it('checks files against the digests, every one when asked', () => {
    const files = new Map([['pack/web-scumm-4.1.19.tgz', Buffer.from('engine')]]);
    expect(digestProblems(m, files)).toEqual([]);
    expect(digestProblems(m, files, { all: true })).toEqual(['image/web-scumm-bridge-image.json: missing']);
    expect(digestProblems(m, new Map([['pack/web-scumm-4.1.19.tgz', Buffer.from('other')]]))).toEqual([
      "pack/web-scumm-4.1.19.tgz: its SHA-256 differs from the manifest's",
    ]);
    expect(digestProblems(m, new Map([['extra', sha256(Buffer.from('x'))]]))).toEqual(['extra: not in the manifest']);
  });

  it('names the run of a provenance statement', () => {
    expect(
      runOfStatement('{"invocationId":"https://github.com/wanoo/web-scumm/actions/runs/38060321565/attempts/1"}'),
    ).toBe('38060321565');
    expect(runOfStatement('{"invocationId":"https://github.com/wanoo/web-scumm/actions/runs/7"}')).toBe('7');
    expect(runOfStatement('{}')).toBeNull();
  });

  it('a candidate run is a green candidate started by hand on main, nothing else', () => {
    const ok = {
      workflowName: 'candidate',
      status: 'completed',
      conclusion: 'success',
      event: 'workflow_dispatch',
      headBranch: 'main',
    };
    expect(candidateRunProblem(ok, '1')).toBeNull();
    expect(candidateRunProblem({ ...ok, workflowName: 'ci' }, '1')).toMatch(/not a candidate run/);
    expect(candidateRunProblem({ ...ok, event: 'pull_request' }, '1')).toMatch(/started by hand on main/);
    expect(candidateRunProblem({ ...ok, headBranch: 'feature' }, '1')).toMatch(/started by hand on main/);
    expect(candidateRunProblem({ ...ok, conclusion: 'failure' }, '1')).toMatch(/green candidate/);
  });
});
