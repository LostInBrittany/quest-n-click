// tools/release/provenance.mjs (4.1.19, plan §6.5): the one contract `ship` and the Field Kit verify a candidate with.
// The manifest read strictly, files against its digests, the run an attestation names, and what makes a run one a tag
// or a pass may stand on. The GitHub calls themselves are field-kit.test.ts's (a stand-in `gh`) and ship's.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  candidateRunProblem,
  digestProblems,
  FORMER_REPO,
  REPO,
  readCandidateManifest,
  repoOfRelease,
  runOfStatement,
  sha256,
  verifyAttestation,
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

describe("the repository's former name (4.2.5, D47)", () => {
  it('verifies a release up to 4.2.4 under wanoo/web-scumm, every later one under wanoo/quest-n-click', () => {
    expect(REPO).toBe('wanoo/quest-n-click');
    expect(FORMER_REPO).toBe('wanoo/web-scumm');
    expect(repoOfRelease('4.2.4')).toBe('wanoo/web-scumm');
    expect(repoOfRelease('v4.1.20-rc.1')).toBe('wanoo/web-scumm');
    expect(repoOfRelease('4.2.5')).toBe('wanoo/quest-n-click');
    expect(repoOfRelease('4.2.5-rc.1')).toBe('wanoo/quest-n-click');
  });

  it.skipIf(process.platform === 'win32')(
    'tries the former name only when asked, and its workflow under that name',
    () => {
      const d = mkdtempSync(join(tmpdir(), 'former-repo-'));
      const gh = join(d, 'gh');
      // A `gh` whose attestations name wanoo/web-scumm only, as a candidate made before the rename.
      writeFileSync(
        gh,
        `#!/bin/sh\necho "$@" >> "${d}/calls"\ncase "$*" in\n  *"--repo wanoo/web-scumm "*) echo '[{"x":"/actions/runs/7/attempts/1"}]' ;;\n  *) echo "no attestation" >&2; exit 1 ;;\nesac\n`,
        { mode: 0o755 },
      );
      const file = join(d, 'candidate-manifest.json');
      writeFileSync(file, '{}');
      const signerWorkflow = `${REPO}/.github/workflows/candidate.yml`;
      expect(() => verifyAttestation(file, { gh, signerWorkflow })).toThrow(/does not verify/);
      expect(verifyAttestation(file, { gh, signerWorkflow, former: true })).toEqual({ runId: '7' });
      expect(readFileSync(join(d, 'calls'), 'utf8')).toContain(
        '--repo wanoo/web-scumm --format json --signer-workflow wanoo/web-scumm/.github/workflows/candidate.yml',
      );
    },
  );
});
