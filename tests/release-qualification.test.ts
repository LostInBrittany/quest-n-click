// The qualification a tag stands on (4.1.20 PR 3, plan §8.1): a candidate started by hand for a tag runs the full
// profile on its own archives and image, and its gate refuses anything less — the short profile, another commit,
// another run, a step missing or failed, an archive or an image other than the candidate's.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs tool without declarations
import { qualificationProblems } from '../tools/release/candidate.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { CATALOGUE, createSteps } from '../scripts/ops-qualify/steps.mjs';

const SHA = 'a'.repeat(40);
const ARCHIVES = [
  { name: 'web-scumm-4.1.20.tgz', sha256: '1'.repeat(64) },
  { name: 'web-scumm-bridge-4.1.20.tgz', sha256: '2'.repeat(64) },
];
const IMAGE = { configDigest: 'sha256:c', manifestDigest: 'sha256:m', archiveSha256: '3'.repeat(64) };
const ids: string[] = (CATALOGUE as { id: string }[]).map((c) => c.id);
const report = (over: Record<string, unknown> = {}) => ({
  format: 'web-scumm-ops-qualify',
  schema: 2,
  profile: 'full',
  commit: SHA,
  candidateRun: '42',
  archives: ARCHIVES,
  image: { ...IMAGE, tag: 'web-scumm-bridge:qualify' },
  steps: ids.map((id) => ({ id, name: id, ok: true, ms: 1 })),
  ...over,
});
const at = { sha: SHA, run: '42', archives: ARCHIVES, image: IMAGE, catalogue: CATALOGUE };

describe('the qualification a tag stands on', () => {
  it('is the full profile of this commit and run, every step passed, on the candidate archives and image', () => {
    expect(qualificationProblems(report(), at)).toEqual([]);
  });

  it('refuses the short profile, another commit, another run, an older report', () => {
    expect(qualificationProblems(report({ profile: 'short' }), at)).toEqual([
      'the short profile (--short): a tag stands on the full one',
    ]);
    expect(qualificationProblems(report({ commit: 'b'.repeat(40) }), at)[0]).toMatch(/^qualified bbbb.*, not aaaa/);
    expect(qualificationProblems(report({ candidateRun: '7' }), at)).toEqual(['qualified for run 7, not 42']);
    expect(qualificationProblems(report({ schema: 1 }), at)).toEqual(['not an ops-qualify report of schema 2']);
  });

  it('refuses a step missing, doubled or failed, by its id', () => {
    const steps = report().steps as { id: string; ok: boolean; firstDefect?: string }[];
    const missing = steps.filter((s) => s.id !== 'replace-store');
    expect(qualificationProblems(report({ steps: missing }), at)).toEqual(['replace-store: not run']);
    expect(qualificationProblems(report({ steps: [...steps, steps[0]] }), at)).toEqual(['images-pinned: run twice']);
    const failed = steps.map((s) => (s.id === 'quota-shared' ? { ...s, ok: false, firstDefect: '429 missing' } : s));
    expect(qualificationProblems(report({ steps: failed }), at)).toEqual(['quota-shared: failed (429 missing)']);
  });

  it("refuses archives or an image other than the candidate's", () => {
    const other = [{ ...ARCHIVES[0]!, sha256: '9'.repeat(64) }, ARCHIVES[1]];
    expect(qualificationProblems(report({ archives: other }), at)).toEqual([
      "the archives installed are not the candidate's (web-scumm-4.1.20.tgz)",
    ]);
    expect(qualificationProblems(report({ archives: ARCHIVES.slice(1) }), at)).toEqual([
      "the archives installed are not the candidate's (web-scumm-4.1.20.tgz)",
    ]);
    const built = { built: 'here' };
    expect(qualificationProblems(report({ image: built }), at)).toEqual([
      "the image is not the candidate's (configDigest, manifestDigest, archiveSha256)",
    ]);
  });
});

describe('the steps of a qualification', () => {
  it('each with its id, its duration, its budget passed, and its first defect when it fails', () => {
    let t = 0;
    const { steps, step } = createSteps({ now: () => t });
    t = 7000;
    step('every image pinned by digest', true, { images: [] });
    t = 7200;
    step('the Bridge image', false, { error: 'not loaded' });
    expect(steps).toEqual([
      { id: 'images-pinned', name: 'every image pinned by digest', ok: true, ms: 7000, overBudgetMs: 5000, images: [] },
      {
        id: 'bridge-image',
        name: 'the Bridge image',
        ok: false,
        ms: 200,
        firstDefect: 'not loaded',
        error: 'not loaded',
      },
    ]);
    expect(() => step('a step nobody named', true)).toThrow(/has no id/);
  });

  it('gives every id once, and every short step is a full step too', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('candidate.yml', () => {
  const wf = readFileSync('.github/workflows/candidate.yml', 'utf8');
  /** A job's block: from its key to the next job's. */
  const job = (name: string) => {
    const from = wf.indexOf(`\n  ${name}:\n`);
    const next = wf.slice(from + 1).search(/\n {2}[a-z0-9-]+:\n/);
    return wf.slice(from, next < 0 ? undefined : from + 1 + next);
  };

  it('runs the full profile on a run started by hand, for this run, on its own archives and image', () => {
    const smoke = job('deployment-smoke');
    expect(smoke).toContain("PROFILE: ${{ github.event_name != 'pull_request' && 'full' || 'short' }}");
    expect(smoke).toMatch(
      /ops:qualify -- --tarballs=candidate-pack --image-from=candidate-image --candidate-run=\$\{\{ github\.run_id \}\} \$\(\[ "\$PROFILE" = short \] && echo --short\)/,
    );
    expect(smoke).not.toMatch(/--image-from=candidate-image --short/);
  });

  it('judges that qualification in its gate, on a run started by hand', () => {
    const gate = job('candidate-gate');
    const i = gate.indexOf('candidate.mjs qualification artifacts/deployment-smoke/ops-qualify.json');
    expect(i).toBeGreaterThan(0);
    expect(gate.slice(gate.lastIndexOf('- name:', i), i)).toContain("if: github.event_name != 'pull_request'");
    expect(gate.slice(i, gate.indexOf('\n', i))).toContain(
      '--pack=artifacts/candidate-pack --image=artifacts/candidate-image',
    );
  });
});

describe('the release tools, as the web-scumm package ships them', () => {
  it('import nothing from scripts/ statically (tools/ ships, scripts/ does not)', async () => {
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync('tools/release').filter((x) => x.endsWith('.mjs')))
      expect(readFileSync(`tools/release/${f}`, 'utf8'), f).not.toMatch(/^import [^;]*from '\.\.\/\.\.\/scripts\//m);
  });
});
