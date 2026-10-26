// The candidate a tag stands on (4.1.17, plan §4.2): one `candidate` run on one SHA, its terminal gate green, its
// manifest naming that SHA, that run and the SHA-256 of every file the release will publish. A tag names the run;
// release.yml checks the files of that very run. The 4.1.16 tag was published before its first heavy run went red.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildManifest,
  candidateOf,
  checkManifest,
  judge,
  requiresCandidate,
  tagMessage,
  // @ts-expect-error: a plain .mjs tool without declarations
} from '../tools/release/candidate.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ws-candidate-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const SHA = 'c'.repeat(40);
mkdirSync(join(dir, 'wsrun'), { recursive: true });
writeFileSync(join(dir, 'wsrun', 'run-story.wsrun'), '{"schema":2}');
writeFileSync(join(dir, 'e2e.json'), '{"ok":true}');

describe('the candidate of a release', () => {
  it("starts itself on a release pull request's merge: a push to main that changes package.json's version (4.5.4)", () => {
    const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
    expect(yml).toMatch(/^ {2}push:\n {4}branches: \[main\]\n {4}paths: \[package\.json\]$/m);
    const merge = yml.slice(yml.indexOf('\n  release-merge:\n'), yml.indexOf('\n  target:\n'));
    // It always runs and succeeds (the gate judges it): on anything but a push it says release=false at once.
    expect(merge).not.toMatch(/^ {4}if:/m);
    // Against the commit main was at before the push, not HEAD^1: a rebase merge or several commits pushed at once
    // put the version's change further back than one commit.
    expect(merge).toContain('BEFORE: ${{ github.event.before }}');
    expect(merge).toContain('git fetch --quiet --depth=1 origin "$BEFORE"');
    expect(merge).toContain('git show "$BEFORE":package.json');
    expect(merge).toContain('echo "release=$release" >> "$GITHUB_OUTPUT"');
    const target = yml.slice(
      yml.indexOf('\n  target:\n'),
      yml.indexOf('\n', yml.indexOf('    if:', yml.indexOf('\n  target:\n'))),
    );
    expect(target).toContain('needs: release-merge');
    expect(target).toContain(
      "if: github.event_name == 'workflow_dispatch' || github.event.label.name == 'full-ci' || needs.release-merge.outputs.release == 'true'",
    );
  });
  it('lets the gate pass a hand-started candidate: release-merge succeeds there, it is never skipped (4.5.4)', () => {
    expect(judge({ 'release-merge': { result: 'success' }, target: { result: 'success' } }).ok).toBe(true);
    expect(judge({ 'release-merge': { result: 'skipped' }, target: { result: 'success' } }).ok).toBe(false);
  });
  it('qualifies, profiles and attests a candidate started by a release merge as one started by hand (4.5.4)', () => {
    const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
    // Only the target job names the events; a step tells a pull request's run (information only) from the others.
    const body = yml.slice(yml.indexOf('\n  release-core:\n'));
    expect(body).not.toContain("github.event_name == 'workflow_dispatch'");
    expect(body).toContain("PROFILE: ${{ github.event_name != 'pull_request' && 'full' || 'short' }}");
    expect(body.split("if: github.event_name != 'pull_request'").length - 1).toBeGreaterThanOrEqual(2);
  });
  it('checks its docs against its own test report, as a warning: a docs problem never holds back the release (4.5.4)', () => {
    const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
    // In release-core, which has the dependencies and writes the report just before.
    const core = yml.slice(yml.indexOf('\n  release-core:\n'), yml.indexOf('\n  heavy:\n'));
    const step = core.slice(core.indexOf('- name: The docs of this candidate'));
    expect(core.indexOf('- name: The docs of this candidate')).toBeGreaterThan(
      core.indexOf('- name: The test report of this candidate'),
    );
    expect(step).toContain(
      'npm run -s wiki -- check --publish --product-ref ${{ needs.target.outputs.sha }} --state candidate --candidate ${{ github.run_id }} --test-report',
    );
    expect(step).toContain('::warning title=docs::');
    expect(step.slice(0, step.indexOf('\n      - '))).toMatch(/continue-on-error: true|\|\| echo "::warning/);
  });
  it("is named by release.yml only when started by hand on main or by a release's merge on main", () => {
    const rel = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(rel).toContain(
      'case "$got" in "candidate completed success workflow_dispatch main"|"candidate completed success push main") ;;',
    );
  });

  it('caps its mutation matrix at 8 jobs at once, so a pull request is not queued behind it (#302)', () => {
    const yml = readFileSync('.github/workflows/candidate.yml', 'utf8');
    const job = yml.slice(yml.indexOf('\n  mutation:\n'), yml.indexOf('\n  mutation-merge:\n'));
    expect(job).toMatch(/strategy:\n {6}fail-fast: false\n {6}max-parallel: 8\n {6}matrix:/);
  });

  it('is required from 4.1.17 on, pre-releases included', () => {
    expect(requiresCandidate('4.1.16')).toBe(false);
    expect(requiresCandidate('v4.1.16-rc.2')).toBe(false);
    expect(requiresCandidate('4.1.17-rc.1')).toBe(true);
    expect(requiresCandidate('v4.1.17')).toBe(true);
    expect(requiresCandidate('4.2.0')).toBe(true);
    expect(requiresCandidate('5.0.0')).toBe(true);
    expect(() => requiresCandidate('4.1')).toThrow();
  });

  it('is named by the tag, on a line of its own', () => {
    expect(candidateOf(tagMessage('4.1.17-rc.1', '123456'))).toBe('123456');
    expect(candidateOf('4.1.16')).toBeNull();
    expect(candidateOf('4.1.17\n\ncandidate-run: 12x')).toBeNull();
    expect(candidateOf('see candidate-run: 99 later')).toBeNull();
  });

  it('is green only when every job it needs succeeded; skipped or cancelled is red', () => {
    expect(judge({ a: { result: 'success' }, b: { result: 'success' } }).ok).toBe(true);
    const r = judge({ a: { result: 'success' }, heavy: { result: 'skipped' }, m: { result: 'cancelled' } });
    expect(r.ok).toBe(false);
    expect(r.failed.map((f: { job: string }) => f.job)).toEqual(['heavy', 'm']);
    expect(judge({}).ok).toBe(false);
    expect(judge({ a: {} }).ok).toBe(false);
  });

  it('lists every file with its SHA-256, and the release checks them against that run and SHA', () => {
    const m = buildManifest({ sha: SHA, runId: 42, createdAt: '2026-10-08T00:00:00Z', dir });
    expect(m.candidateRunId).toBe('42');
    expect(m.artifacts.map((a: { name: string }) => a.name)).toEqual(['e2e.json', 'wsrun/run-story.wsrun']);
    expect(checkManifest(m, { sha: SHA, runId: '42', dir })).toEqual([]);
    expect(checkManifest(m, { sha: 'd'.repeat(40), runId: '42', dir })[0]).toMatch(/tested c+, not d+/);
    expect(checkManifest(m, { sha: SHA, runId: '43', dir })[0]).toMatch(/run 42's, not 43's/);
    // A file changed, removed or added after the candidate: refused.
    writeFileSync(join(dir, 'e2e.json'), '{"ok":false}');
    expect(checkManifest(m, { sha: SHA, runId: '42', dir })).toEqual([
      "e2e.json: its SHA-256 differs from the candidate's",
    ]);
    writeFileSync(join(dir, 'extra.txt'), 'x');
    rmSync(join(dir, 'wsrun', 'run-story.wsrun'));
    expect(checkManifest(m, { sha: SHA, runId: '42', dir })).toEqual([
      "e2e.json: its SHA-256 differs from the candidate's",
      'wsrun/run-story.wsrun: missing',
      'extra.txt: not in the manifest',
    ]);
    expect(checkManifest({ format: 'other' }, { sha: SHA, runId: '42', dir })).toEqual([
      'not a candidate manifest of schema 1',
    ]);
    expect(() => buildManifest({ sha: 'abc', runId: 1, dir })).toThrow(/full SHA/);
  });
});

describe('the workflows that judge a candidate', () => {
  const wf = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');
  // The jobs: the 2-space keys after `jobs:` (`on:`'s triggers are 2-space keys too).
  const jobs = (text: string) =>
    [...text.slice(text.indexOf('\njobs:\n')).matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);

  it('run every shard of every gated set from the one generated matrix, never a list of their own (4.1.20)', () => {
    for (const name of ['candidate', 'nightly', 'ci']) {
      const text = wf(name);
      expect(text, name).not.toMatch(/^ {8}set: \[/m);
      expect(text, name).not.toMatch(/--set=all/);
      const kind = name === 'nightly' ? 'nightly' : 'gated';
      expect(text, name).toContain(`npx tsx tools/mutation-shards.ts --matrix=${kind}`);
      expect(text, name).toContain('matrix: ${{ fromJSON(needs.mutation-plan.outputs.matrix) }}');
      expect(text, name).toContain('--shard=${{ matrix.shard }}/${{ matrix.shards }}');
      expect(jobs(text), name).toEqual(expect.arrayContaining(['mutation-plan', 'mutation', 'mutation-merge']));
      // The merge judges the set: a shard missing, doubled or of other inputs fails it (tools/mutation-shards.ts).
      expect(text, name).toContain('npx tsx tools/mutate.ts --set="$set" --merge --from=shards || code=1');
      // Postgres for the one set whose tests need it (the others would judge mutants otherwise than the gate).
      expect(text, name).toContain(
        "BRIDGE_PG_URL: ${{ matrix.pg && 'postgres://bridge:bridge@127.0.0.1:5432/bridge' || '' }}",
      );
    }
    expect(wf('nightly')).toContain('continue-on-error: ${{ !matrix.gated }}');
    for (const name of ['candidate', 'ci'])
      expect(wf(name), name).not.toContain('continue-on-error: ${{ !matrix.gated }}');
  });

  it('the nightly saves each passed gated shard under the very key the candidate restores, on main (4.5.5, #329)', () => {
    // A job's text: from its key to the next job's.
    const job = (text: string, name: string) => {
      const from = text.indexOf(`\n  ${name}:\n`);
      const rest = text.slice(from + 1);
      const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
      return next < 0 ? rest : rest.slice(0, next + 1);
    };
    const KEY = 'key: mutation-${{ matrix.name }}-${{ steps.inputs.outputs.hash }}';
    const HASH = 'run: echo "hash=$(npx tsx tools/mutate.ts --set=${{ matrix.set }} --hash)" >> "$GITHUB_OUTPUT"';
    const candidate = job(wf('candidate'), 'mutation');
    const nightly = job(wf('nightly'), 'mutation');
    for (const [name, text] of [
      ['candidate', candidate],
      ['nightly', nightly],
    ] as const) {
      expect(text, name).toContain(HASH);
      expect(text, name).toContain(`path: .cache/mutation\n          ${KEY}`);
    }
    // The save: only a gated shard, only when it passed (no always(), so success() is implied), not on a warm-up's hit.
    const at = nightly.lastIndexOf('\n      - ', nightly.indexOf('uses: actions/cache/save@'));
    const save = nightly.slice(at, nightly.indexOf('\n      - ', at + 1));
    expect(save).toMatch(/- if: matrix\.gated && steps\.restore\.outputs\.cache-hit != 'true'\n/);
    expect(save).not.toMatch(/always\(\)|failure\(\)/);
    expect(save).toMatch(/actions\/cache\/save@[0-9a-f]{40} # v/);
    // It saves after the run, and the hash is read before any mutant.
    expect(nightly.indexOf(HASH)).toBeLessThan(nightly.indexOf('npm run test:mutation:core'));
    expect(nightly.indexOf('npm run test:mutation:core')).toBeLessThan(nightly.indexOf('actions/cache/save@'));
    // The night measures fresh; a warm-up reuses what the cache holds. 8 at a time, as the candidate (#302).
    expect(nightly).toContain("${{ inputs.jobs != 'mutation' && '--fresh' || '' }}");
    expect(nightly).toMatch(/- id: restore\n {8}if: inputs\.jobs == 'mutation' && matrix\.gated\n/);
    expect(nightly).toMatch(/strategy:\n {6}fail-fast: false\n {6}max-parallel: 8\n {6}matrix:/);
  });

  it('the nightly by hand with jobs=mutation runs the mutation jobs only: a warm-up of the cache (#329)', () => {
    const text = wf('nightly');
    expect(text).toMatch(/ {6}jobs:\n(?: {8}.*\n)*? {8}options: \[all, mutation\]\n {8}default: all\n/);
    // The late-start guard (#372) runs in every run: a run by hand is never late (tests/schedule-guard.test.ts). So
    // does the report (#379): a red warm-up is news the candidate would give a day late (tests/nightly-report.test.ts).
    for (const name of jobs(text).filter((j) => j !== 'guard' && j !== 'report')) {
      const body = text.slice(text.indexOf(`\n  ${name}:\n`) + 1).split(/\n {2}[a-z][a-z0-9-]*:\n/)[0]!;
      const guarded =
        /\n {4}if: (?:always\(\) && )?needs\.guard\.outputs\.run == 'true' && inputs\.jobs != 'mutation'\n/.test(body);
      expect(guarded, name).toBe(!name.startsWith('mutation'));
    }
    expect(text.slice(text.indexOf('\n  report:\n'))).not.toContain("inputs.jobs != 'mutation'");
  });

  it('release.yml runs no mutation set (4.5.3, #291): the candidate the tag names ran them on the same SHA', () => {
    const release = wf('release');
    expect(jobs(release.slice(release.indexOf('\njobs:\n')))).toEqual([
      'release',
      'npm-stage',
      'docs-publish',
      'site-revalidate',
    ]);
    expect(release).not.toMatch(/mutation-shards|test:mutation|mutate\.ts/);
  });

  it('judge a candidate only once every set is merged; the release job waits for no job', () => {
    const gate = wf('candidate').slice(wf('candidate').indexOf('\n  candidate-gate:'));
    expect(gate.slice(0, gate.indexOf('\n    if:'))).toMatch(/needs: \[[^\]]*mutation-plan, mutation, mutation-merge/);
    const release = wf('release').slice(wf('release').indexOf('\n  release:'));
    expect(release.slice(0, release.indexOf('\n    steps:'))).not.toMatch(/^ {4}needs:/m);
  });

  it('never let a pipe hide a failure: every step piped into tee runs under `shell: bash` (pipefail)', () => {
    // Candidate 37998053206 (9 October 2026): `gate | tee` under GitHub's default `bash -e`, without pipefail, printed
    // `✖ mutation: failure` and passed.
    for (const f of readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'))) {
      const lines = readFileSync(join('.github/workflows', f), 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (!l.includes('| tee')) return;
        let start = i;
        while (start > 0 && !/^\s+- /.test(lines[start]!)) start--;
        let end = i;
        while (end + 1 < lines.length && !/^\s+- |^ {0,2}\S/.test(lines[end + 1]!)) end++;
        expect(lines.slice(start, end + 1).join('\n'), `${f}:${i + 1}`).toMatch(/^\s+(- )?shell: bash$/m);
      });
    }
  });

  it('judge every job in the terminal gate, which then writes the manifest', () => {
    const text = wf('candidate');
    // The gate's own `needs` (a job above may need another: `external-consumer` needs `pack`, 4.1.18).
    const needs = text
      .slice(text.indexOf('\n  candidate-gate:'))
      .match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1]
      ?.split(',')
      .map((s) => s.trim());
    expect(needs).toEqual(jobs(text).filter((j) => j !== 'candidate-gate'));
    expect(text).toContain('node tools/release/candidate.mjs gate');
    expect(text).toContain('--run=${{ github.run_id }}');
  });

  it('measure each store in its own job, and refuse a report of another backend', () => {
    // The nightly loads once; the candidate three times (4.1.20, plan §8.3), every report checked, then their medians.
    const nightly = wf('nightly');
    expect(nightly).toContain('--store=sqlite --out=bridge-load-sqlite.json');
    expect(nightly).toContain('tools/load-report.ts bridge-load-sqlite.json --store=sqlite');
    expect(nightly).toContain('tools/load-report.ts bridge-load-postgres.json --store=postgres');
    const candidate = wf('candidate');
    for (const store of ['sqlite', 'postgres']) {
      expect(candidate).toContain(`--out=bridge-load-${store}-$i.json`);
      expect(candidate).toContain(`tools/load-report.ts bridge-load-${store}-$i.json --store=${store}`);
      expect(candidate).toContain(`tools/load-median.ts --store=${store} --out=load-median-${store}.json`);
    }
    for (const text of [nightly, candidate]) expect(text).not.toMatch(/BRIDGE_STORE:/);
  });

  it('publish the candidate run the tag names, after checking its sums', () => {
    const text = wf('release');
    expect(text).toContain('node tools/release/candidate.mjs run-of "$TAG"');
    expect(text).toContain('candidate.mjs check .candidate-manifest/candidate-manifest.json --sha="$SHA" --run="$run"');
    expect(text).toContain('actions: read');
    // Only a run started by hand on main: a pull request's run judges its own copy of candidate.yml.
    expect(text).toContain('"candidate completed success workflow_dispatch main"');
    // ship.mjs asks tools/release/provenance.mjs (4.1.19), the contract the Field Kit's bundles are verified with too.
    expect(readFileSync('tools/release/ship.mjs', 'utf8')).toMatch(/candidateRunProblem\(queryRun\(runId\), runId\)/);
    expect(readFileSync('tools/release/provenance.mjs', 'utf8')).toMatch(
      /\['workflow_dispatch', 'push'\]\.includes\(r\.event\) \|\| r\.headBranch !== 'main'/,
    );
  });

  it('stay quiet on a pull request without full-ci (no target, no gate, no red check)', () => {
    expect(wf('candidate')).toContain("if: always() && needs.target.result != 'skipped'");
  });

  it('starts on a pull request only when full-ci is added, never on its pushes (4.5.3)', () => {
    const w = wf('candidate');
    expect(w).toMatch(/^ {2}pull_request:\n {4}types: \[labeled\]\n/m);
    expect(w).not.toMatch(/synchronize/);
    expect(w).toContain(
      "if: github.event_name == 'workflow_dispatch' || github.event.label.name == 'full-ci' || needs.release-merge.outputs.release == 'true'",
    );
  });
});
