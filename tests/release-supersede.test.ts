// A later candidate cancels an earlier red one of the same version (#410 PR 4 e). 4.6.0's first candidate ran 72 min
// after `release-core` failed (330 runner-minutes), 4.7.0's 105 min after its core mutants (520), while the candidate
// on the fix waited for runners. Only a run that cannot turn green is cancelled: same version, another SHA, started
// before this one, still running, a job already failed. Never a green or running-green run, never another version's,
// never a pull request's, never one whose SHA the run's name does not say.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { candidateSha, runName, superseded } from '../tools/release/supersede.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

describe("a candidate's name", () => {
  it('says the SHA it tests: the input, else the head', () => {
    expect(runName(A)).toBe(`candidate ${A}`);
    expect(candidateSha(`candidate ${A}`)).toBe(A);
  });
  it('is no SHA when it says none (a run named before #410, a short or other title)', () => {
    expect(candidateSha('candidate')).toBeUndefined();
    expect(candidateSha('Merge pull request #442 from Quest-n-Click/release/4.7.0')).toBeUndefined();
    expect(candidateSha(`candidate ${A.slice(0, 12)}`)).toBeUndefined();
    expect(candidateSha(`candidate ${A} again`)).toBeUndefined();
  });
  it('is the one candidate.yml gives every run', () => {
    const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
    expect(yml).toMatch(
      /^run-name: candidate \$\{\{ github\.event\.inputs\.sha \|\| github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}$/m,
    );
  });
});

describe('the earlier candidates a later one cancels', () => {
  const self = {
    id: 100,
    sha: B,
    version: '4.7.0',
    event: 'workflow_dispatch',
    branch: 'main',
    createdAt: '2026-11-05T15:31:00Z',
  };
  const run = (o: Record<string, unknown> = {}) => ({
    id: 42,
    name: `candidate ${A}`,
    event: 'push',
    branch: 'main',
    status: 'in_progress',
    createdAt: '2026-11-05T13:15:00Z',
    ...o,
  });
  const versions: Record<string, string> = { [A]: '4.7.0', [B]: '4.7.0', [C]: '4.7.1' };
  const failed = (j: Record<number, string[]>) => (id: number) => j[id] ?? [];
  const decide = (runs: unknown[], jobs: Record<number, string[]> = { 42: ['mutation (core-1of1)'] }) =>
    superseded({ self, runs, versionOf: (sha: string) => versions[sha], failedJobs: failed(jobs) });

  it("cancels 4.7.0's first candidate from its second: same version, another SHA, earlier, running, a job red", () => {
    expect(decide([run()])).toEqual([
      { id: 42, sha: A, why: `candidate 42 (${A.slice(0, 7)}, 4.7.0) is red (mutation (core-1of1)) and still running` },
    ]);
  });
  it('never a running-green run: no job has failed yet', () => {
    expect(decide([run()], {})).toEqual([]);
  });
  it('never a run already completed, green or red: there is nothing left to cancel', () => {
    for (const status of ['completed']) expect(decide([run({ status })])).toEqual([]);
  });
  it("never another version's candidate, nor one whose version cannot be read", () => {
    expect(decide([run({ name: `candidate ${C}` })], { 42: ['x'] })).toEqual([]);
    expect(superseded({ self, runs: [run()], versionOf: () => undefined, failedJobs: failed({ 42: ['x'] }) })).toEqual(
      [],
    );
  });
  it('never this run itself, a run of the same SHA, or one started after this one', () => {
    expect(decide([run({ id: 100 })], { 100: ['x'] })).toEqual([]);
    expect(decide([run({ name: `candidate ${B}` })])).toEqual([]);
    expect(decide([run({ createdAt: '2026-11-05T15:40:00Z' })])).toEqual([]);
  });
  it("never a pull request's candidate (information only), nor a run off main, nor one named before #410", () => {
    expect(decide([run({ event: 'pull_request' })])).toEqual([]);
    expect(decide([run({ branch: 'release/4.7.0' })])).toEqual([]);
    expect(decide([run({ name: 'candidate' })])).toEqual([]);
  });
  it("cancels nothing from a pull request's candidate", () => {
    expect(
      superseded({
        self: { ...self, event: 'pull_request' },
        runs: [run()],
        versionOf: (sha: string) => versions[sha],
        failedJobs: failed({ 42: ['x'] }),
      }),
    ).toEqual([]);
  });
  it('counts a failed or timed-out job as red, never a cancelled or skipped one (the list is the caller’s)', () => {
    const src = readFileSync('tools/release/supersede.mjs', 'utf8');
    expect(src).toMatch(/\['failure', 'timed_out'\]\.includes\(j\.conclusion\)/);
  });
});

describe('the job that does it', () => {
  const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
  const job = (id: string) => {
    const i = yml.indexOf(`\n  ${id}:\n`);
    const next = yml.slice(i + 1).search(/\n {2}[a-z][\w-]*:\n/);
    return yml.slice(i, next < 0 ? undefined : i + 1 + next);
  };
  it('runs once target has said the SHA, with the right to cancel runs and no other', () => {
    const s = job('supersede');
    expect(s).toMatch(/^ {4}needs: target$/m);
    expect(s).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}actions: write$/m);
    expect(s).toContain('run: node tools/release/supersede.mjs');
    expect(s).toContain('SHA: ${{ needs.target.outputs.sha }}');
    expect(s).toContain('RUN_ID: ${{ github.run_id }}');
    expect(s).toContain('GH_TOKEN: ${{ github.token }}');
    // The one job allowed to write to Actions: every other keeps the workflow's read-only token.
    expect(yml.match(/actions: write/g)).toHaveLength(1);
  });
  it('is judged by the gate like every job, so it never fails: a problem is a warning', () => {
    const gate = job('candidate-gate');
    expect(gate).toMatch(/needs: \[[^\]]*\bsupersede\b/);
    const src = readFileSync('tools/release/supersede.mjs', 'utf8');
    expect(src).not.toMatch(/process\.exit\([1-9]/);
    expect(src).toContain('::warning::');
  });
});
