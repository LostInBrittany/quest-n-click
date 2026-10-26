// A red nightly opens an issue (4.5.6, #379, tools/nightly-report.ts). On 2026-10-26 a red nightly was found at the
// next release's candidate, a day late: nobody is told of a red night but by the cross on the Actions page. The
// nightly's last job now reads every job's result and opens an issue labelled `nightly-red`, comments on the open one
// (one issue per red streak), or closes it when a nightly is green again. The decisions, the text, then the workflow.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type KnownSurvivor, sameMutant } from '../tools/mutate';
import { decide, LABEL, isKnown, redJobs, type Run, unexplained } from '../tools/nightly-report';

const ok = { result: 'success' };
/** Every job of a full night, green. */
const GREEN: Record<string, { result: string }> = {
  guard: ok,
  'npm-names': ok,
  heavy: ok,
  'fuzz-connectors': ok,
  corpus: ok,
  merge: ok,
  'mutation-plan': ok,
  mutation: ok,
  'mutation-merge': ok,
  'bridge-load-sqlite': ok,
  'bridge-load-postgres': ok,
  matrix: ok,
  'cross-runtime': ok,
  'worker-container': ok,
};
const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const night: Run = {
  number: 812,
  url: 'https://github.com/Quest-n-Click/quest-n-click/actions/runs/123',
  sha: SHA,
  date: '2026-10-27',
  event: 'schedule',
  jobs: '',
};
const warmup: Run = { ...night, event: 'workflow_dispatch', jobs: 'mutation' };
const skippedButMutation = Object.fromEntries(
  Object.keys(GREEN).map((k) => [
    k,
    ['guard', 'mutation-plan', 'mutation', 'mutation-merge'].includes(k) ? ok : { result: 'skipped' },
  ]),
);
const survivor = {
  set: 'core',
  file: 'src/engine/core/engine.ts',
  line: 120,
  operator: 'ConditionalExpression',
  from: 'a > b',
  to: 'true',
  context: 'if (a > b) return x;',
};

describe('the red jobs', () => {
  it('are the failed, cancelled and timed-out ones (a timeout is a failure), in the order of the workflow', () => {
    expect(redJobs(GREEN)).toEqual([]);
    expect(redJobs({ ...GREEN, heavy: { result: 'failure' }, 'mutation-merge': { result: 'cancelled' } })).toEqual([
      { job: 'heavy', result: 'failure' },
      { job: 'mutation-merge', result: 'cancelled' },
    ]);
  });

  it('never a skipped job: a warm-up skips every job but the mutation ones, and stays green', () => {
    expect(redJobs(skippedButMutation)).toEqual([]);
  });

  it('a failed guard is red too: the night ran nothing', () => {
    expect(redJobs({ guard: { result: 'failure' }, heavy: { result: 'skipped' } })).toEqual([
      { job: 'guard', result: 'failure' },
    ]);
  });
});

describe('the surviving mutants', () => {
  // Only what the match reads; the rest of a named survivor (why, category, proof…) is docs/dev/mutants.json's.
  const known = [
    { file: 'src/a.ts', operator: 'BinaryOperator', from: '+', to: '-' },
    { file: 'src/b.ts', operator: 'BooleanLiteral', from: 'true', to: 'false', context: 'const x = true;' },
  ] as KnownSurvivor[];
  const r = (file: string, operator: string, from: string, to: string, context: string, status = 'survived') => ({
    file,
    line: 7,
    operator,
    from,
    to,
    context,
    status,
  });

  it('match a named survivor exactly as tools/mutate.ts does (the tool is self-contained, so the rule is copied)', () => {
    const cases = [
      r('src/a.ts', 'BinaryOperator', '+', '-', 'anything'),
      r('src/a.ts', 'BinaryOperator', '+', '*', 'anything'),
      r('src/b.ts', 'BooleanLiteral', 'true', 'false', 'const x = true;'),
      r('src/b.ts', 'BooleanLiteral', 'true', 'false', 'const y = true;'),
      r('src/c.ts', 'BinaryOperator', '+', '-', 'anything'),
    ];
    for (const c of cases) for (const k of known) expect(isKnown(c, k), JSON.stringify([c, k])).toBe(sameMutant(c, k));
  });

  it("are those of a failed set's merged report that docs/dev/mutants.json does not name, killed ones never", () => {
    const reports = [
      {
        set: 'core',
        status: 'failed',
        results: [
          r('src/a.ts', 'BinaryOperator', '+', '-', 'x'),
          r('src/c.ts', 'BinaryOperator', '+', '-', 'y = a + b'),
          r('src/c.ts', 'BinaryOperator', '-', '+', 'z', 'killed'),
        ],
      },
      { set: 'remix', status: 'passed', results: [r('src/d.ts', 'BinaryOperator', '+', '-', 'w')] },
    ];
    expect(unexplained(reports, known)).toEqual([
      { set: 'core', file: 'src/c.ts', line: 7, operator: 'BinaryOperator', from: '+', to: '-', context: 'y = a + b' },
    ]);
  });
});

describe('the decision', () => {
  it('a green night with no issue open: nothing to do', () => {
    expect(decide({ needs: GREEN, run: night, open: [], survivors: [] })).toMatchObject({ action: 'none', issues: [] });
  });

  it('a red night with no issue open: opens one, labelled, with the date, the commit, the run and the red jobs', () => {
    const d = decide({ needs: { ...GREEN, heavy: { result: 'failure' } }, run: night, open: [], survivors: [] });
    expect(d.action).toBe('open');
    expect(d.issues).toEqual([]);
    expect(LABEL).toBe('nightly-red');
    expect(d.title).toBe('The nightly is red since 2026-10-27');
    expect(d.body).toContain('2026-10-27');
    expect(d.body).toContain(SHA);
    expect(d.body).toContain(`[run #812](${night.url})`);
    expect(d.body).toContain('| `heavy` | failure |');
    expect(d.body).not.toContain('`corpus`');
    expect(d.body).toContain('a scheduled run');
    // Says what closes it, and who wrote it.
    expect(d.body).toMatch(/tools\/nightly-report\.ts/);
    expect(d.body).toMatch(/closes it/);
  });

  it('a red night with an issue open: comments on it, one issue per streak', () => {
    const d = decide({
      needs: { ...GREEN, corpus: { result: 'cancelled' } },
      run: night,
      open: [{ number: 401 }],
      survivors: [],
    });
    expect(d).toMatchObject({ action: 'comment', issues: [401] });
    expect(d.body).toContain('| `corpus` | cancelled |');
    expect(d.body).toContain(`[run #812](${night.url})`);
    expect(d.body).not.toMatch(/closes it/);
  });

  it('two issues open (one opened by hand with the label): comments on the oldest', () => {
    const d = decide({
      needs: { ...GREEN, heavy: { result: 'failure' } },
      run: night,
      open: [{ number: 410 }, { number: 401 }],
      survivors: [],
    });
    expect(d).toMatchObject({ action: 'comment', issues: [401] });
  });

  it('a green night with an issue open: "green again on <run>", then closes every open one', () => {
    const d = decide({ needs: GREEN, run: night, open: [{ number: 410 }, { number: 401 }], survivors: [] });
    expect(d).toMatchObject({ action: 'close', issues: [401, 410] });
    expect(d.body).toMatch(/^Green again on \[run #812\]\(https:[^)]+\/runs\/123\)/);
    expect(d.body).toContain('2026-10-27');
    expect(d.body).toContain(SHA.slice(0, 7));
  });

  it('a failed mutation gate lists the surviving mutants not named', () => {
    const d = decide({
      needs: { ...GREEN, 'mutation-merge': { result: 'failure' } },
      run: night,
      open: [],
      survivors: [survivor],
    });
    expect(d.body).toContain('docs/dev/mutants.json');
    expect(d.body).toContain(
      '- `core`: `src/engine/core/engine.ts:120` ConditionalExpression: `a > b` → `true` (`if (a > b) return x;`)',
    );
  });

  it('caps the list at 20 mutants and says how many more', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ ...survivor, line: i + 1 }));
    const d = decide({
      needs: { ...GREEN, 'mutation-merge': { result: 'failure' } },
      run: night,
      open: [],
      survivors: many,
    });
    expect(d.body.match(/^- `core`:/gm)).toHaveLength(20);
    expect(d.body).toContain('and 3 more');
  });

  it('a failed mutation job without a report that names a survivor points to the jobs', () => {
    for (const job of ['mutation', 'mutation-merge', 'mutation-plan']) {
      const d = decide({ needs: { ...GREEN, [job]: { result: 'failure' } }, run: night, open: [], survivors: [] });
      expect(d.body, job).toMatch(/no merged report names a surviving mutant/);
    }
    const other = decide({ needs: { ...GREEN, heavy: { result: 'failure' } }, run: night, open: [], survivors: [] });
    expect(other.body).not.toMatch(/mutant/);
  });

  it('a red warm-up of the mutation cache reports too: the candidate would fail on it', () => {
    const red = { ...skippedButMutation, 'mutation-merge': { result: 'failure' } };
    const d = decide({ needs: red, run: warmup, open: [], survivors: [survivor] });
    expect(d.action).toBe('open');
    expect(d.body).toContain('a warm-up of the mutation cache');
    expect(d.body).not.toContain('`heavy`');
    expect(decide({ needs: red, run: warmup, open: [{ number: 401 }], survivors: [] }).action).toBe('comment');
  });

  it('a green warm-up never closes the issue: it skipped every other job', () => {
    const d = decide({ needs: skippedButMutation, run: warmup, open: [{ number: 401 }], survivors: [] });
    expect(d).toMatchObject({ action: 'none', issues: [] });
    expect(d.say).toMatch(/warm-up/);
  });

  it('a full run by hand counts as a night', () => {
    const byHand = { ...night, event: 'workflow_dispatch', jobs: 'all' };
    expect(decide({ needs: GREEN, run: byHand, open: [{ number: 401 }], survivors: [] }).action).toBe('close');
    expect(
      decide({ needs: { ...GREEN, heavy: { result: 'failure' } }, run: byHand, open: [], survivors: [] }).body,
    ).toContain('a run by hand');
  });
});

describe('the workflow', () => {
  const text = readFileSync('.github/workflows/nightly.yml', 'utf8');
  /** Each job's text, by its name (the 2-space keys after `jobs:`). */
  const jobs = (() => {
    const body = text.slice(text.indexOf('\njobs:\n') + 6);
    const parts = body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).filter((p) => /^ {2}[a-z]/.test(p));
    return new Map(parts.map((p) => [/^ {2}([a-z][a-z0-9-]*):/.exec(p)![1]!, p]));
  })();
  const report = jobs.get('report')!;

  it('has a last job, report, that needs every other job, so none is forgotten', () => {
    expect(report).toBeDefined();
    expect([...jobs.keys()].at(-1)).toBe('report');
    const needs = /^ {4}needs: \[([^\]]*)\]$/m
      .exec(report)![1]!
      .split(',')
      .map((s) => s.trim());
    expect(needs.sort()).toEqual([...jobs.keys()].filter((j) => j !== 'report').sort());
    // The tool's list of a full night is the workflow's.
    expect(Object.keys(GREEN).sort()).toEqual(needs.sort());
  });

  it('runs whatever the results, when the run ran: not when the guard skipped it in the working day', () => {
    expect(report).toMatch(
      /^ {4}if: always\(\) && \(needs\.guard\.outputs\.run == 'true' \|\| needs\.guard\.result != 'success'\)$/m,
    );
  });

  it('alone may write issues; the workflow keeps its read-only token', () => {
    expect(text).toMatch(/\npermissions:\n {2}contents: read\njobs:/);
    expect(report).toMatch(/\n {4}permissions:\n {6}contents: read\n {6}issues: write\n/);
    expect(text.match(/^ +issues: write$/gm)).toHaveLength(1);
    for (const [name, body] of jobs) if (name !== 'report') expect(body, name).not.toMatch(/^ {4}permissions:/m);
  });

  it('gives the tool every result, the open issues and the merged mutation reports; gh writes', () => {
    expect(report).toContain('NIGHTLY_RESULTS: ${{ toJSON(needs) }}');
    expect(report).toContain('GH_TOKEN: ${{ github.token }}');
    expect(report).toContain(`--label ${LABEL} --state open`);
    expect(report).toContain('node --experimental-strip-types --no-warnings tools/nightly-report.ts');
    expect(report).toMatch(/name: mutation-merged\n/);
    expect(report).not.toMatch(/npm ci/);
    for (const cmd of ['gh label create', 'gh issue create', 'gh issue comment', 'gh issue close'])
      expect(report, cmd).toContain(cmd);
  });
});
