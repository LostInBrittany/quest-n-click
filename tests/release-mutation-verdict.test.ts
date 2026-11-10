// The release command never re-runs a mutation verdict (next, #471). 4.7.2's candidate 42527046788 failed on eleven
// survivors in six shards; the command re-ran it (attempt 2), which spent 72 minutes failing the same six, and the
// survivors were dug out of the job logs. A shard red on a verdict now says it in an annotation (`mutation verdict`,
// written by candidate.yml from the shard's report), the release command reads it and stops at once, listing the
// survivors; a job that died otherwise (runner lost, timeout, cancelled) writes none and is re-run as before.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sameMutant } from '../tools/mutate';
import {
  readVerdict,
  shardVerdict,
  VERDICT_MAX,
  VERDICT_TITLE,
  verdictCommand,
} from '../tools/release/mutation-verdict';
import { candidateGate, candidateStep, gateReport, type Verdict } from '../tools/release/release-run';

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const SHA = '5fc74d4146c34ec4a0096792ce72f3ca72ebc55a';
const URL = 'https://github.com/Quest-n-Click/quest-n-click/actions/runs/42527046788';
const mutant = (file: string, line: number, operator: string, from: string, to: string, status = 'survived') => ({
  file,
  line,
  operator,
  from,
  to,
  context: `${from} (line ${line})`,
  status,
});
// studio-auth's shard in run 42527046788: three survivors nobody named, one named, one killed.
const studioAuth = {
  v: 1,
  set: 'studio-auth',
  inputHash: '67fdafc54e008f61',
  commitSha: SHA,
  status: 'failed',
  shard: { index: 1, total: 1 },
  results: [
    mutant('studio-server/src/server/auth/gate.ts', 152, 'condition true', '!flight', 'true'),
    mutant('studio-server/src/server/auth/gate.ts', 162, 'condition true', '!(e instanceof DefinitiveRefusal)', 'true'),
    mutant('studio-server/src/server/auth/routes.ts', 44, 'operator', '>', '>='),
    mutant('studio-server/src/server/auth/session.ts', 10, 'operator', '===', '!=='),
    mutant('studio-server/src/server/auth/session.ts', 12, 'boolean', 'true', 'false', 'killed'),
  ],
};
const named = [
  {
    file: 'studio-server/src/server/auth/session.ts',
    operator: 'operator',
    from: '===',
    to: '!==',
  },
];
const same = (a: Parameters<typeof sameMutant>[0], b: (typeof named)[number]) =>
  sameMutant(a, b as Parameters<typeof sameMutant>[1]);

describe("a shard's verdict, from its report", () => {
  it('lists the survivors nobody named, file:line operator: from → to', () => {
    expect(
      shardVerdict({
        report: studioAuth,
        known: named,
        incomplete: [],
        sha: SHA,
        same,
      }),
    ).toEqual([
      'studio-auth shard 1/1: 3 survivors not named in docs/dev/mutants.json',
      'studio-server/src/server/auth/gate.ts:152 condition true: !flight → true',
      'studio-server/src/server/auth/gate.ts:162 condition true: !(e instanceof DefinitiveRefusal) → true',
      'studio-server/src/server/auth/routes.ts:44 operator: > → >=',
    ]);
  });
  it('none when the job died otherwise: no report, a passed one, one of another commit', () => {
    expect(shardVerdict({ known: named, incomplete: [], sha: SHA, same })).toBeUndefined();
    expect(
      shardVerdict({
        report: { ...studioAuth, status: 'passed' },
        known: named,
        incomplete: [],
        same,
      }),
    ).toBeUndefined();
    expect(
      shardVerdict({
        report: studioAuth,
        known: named,
        incomplete: [],
        sha: 'b'.repeat(40),
        same,
      }),
    ).toBeUndefined();
  });
  it('docs/dev/mutants.json entries that do not hold are a verdict too (the same refusal on every try)', () => {
    const v = shardVerdict({
      known: named,
      incomplete: ['a.ts operator: > → >=: an owner'],
      same,
    });
    expect(v).toEqual(['docs/dev/mutants.json: 1 entry does not hold', 'a.ts operator: > → >=: an owner']);
  });
});

describe('the annotation, written then read back', () => {
  it('is an ::error with its title, newlines and % escaped as GitHub reads them', () => {
    const cmd = verdictCommand(['a: 1 survivor', 'x.ts:1 operator: % → %%']);
    expect(cmd).toBe(`::error title=${VERDICT_TITLE}::a: 1 survivor%0Ax.ts:1 operator: %25 → %25%25`);
  });
  it('round-trips through the check-runs API, the other annotations ignored', () => {
    const lines = shardVerdict({
      report: studioAuth,
      known: named,
      incomplete: [],
      sha: SHA,
      same,
    })!;
    const message = decodeURIComponent(verdictCommand(lines).split('::')[2]!);
    const api = [
      {
        title: '',
        annotation_level: 'failure',
        message: 'Process completed with exit code 1.',
      },
      { title: VERDICT_TITLE, annotation_level: 'failure', message },
    ];
    expect(readVerdict(api)).toEqual(lines);
    expect(readVerdict([api[0]])).toBeUndefined();
    expect(readVerdict({ message: 'not a list' })).toBeUndefined();
  });
  it(`keeps ${VERDICT_MAX} survivors and says how many more`, () => {
    const many = ['s: 30 survivors', ...Array.from({ length: 30 }, (_, i) => `f.ts:${i} operator: > → >=`)];
    const read = decodeURIComponent(verdictCommand(many).split('::')[2]!).split('\n');
    expect(read).toHaveLength(VERDICT_MAX + 2);
    expect(read.at(-1)).toBe("… and 5 more in the job's log");
  });
  it('the CLI prints it from a report file, or says there is no verdict', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mutation-verdict-'));
    temps.push(dir);
    const file = join(dir, 'report.json');
    writeFileSync(file, JSON.stringify(studioAuth));
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), 'tools/release/mutation-verdict.ts', ...args],
        {
          encoding: 'utf8',
        },
      );
    const r = cli(`--report=${file}`, `--sha=${SHA}`);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^::error title=mutation verdict::studio-auth shard 1\/1: 4 survivors not named/);
    expect(r.stdout).toContain('%0Astudio-server/src/server/auth/routes.ts:44 operator: > → >=');
    const none = cli(`--report=${join(dir, 'missing.json')}`, `--sha=${SHA}`);
    expect(none.status).toBe(0);
    expect(none.stdout).not.toContain('::error');
    expect(none.stdout).toContain('no mutation verdict');
  }, 60_000);
  it("the candidate's shards write it after a failed mutation step, from the shard's report (mutation-run.yml, #525)", () => {
    const yml = readFileSync('.github/workflows/mutation-run.yml', 'utf8');
    const job = yml.slice(yml.indexOf('\n  mutation:\n'), yml.indexOf('\n  merge:\n'));
    const mutate = job.indexOf('id: mutate');
    const step = job.indexOf('tools/release/mutation-verdict.ts');
    expect(mutate).toBeGreaterThan(0);
    expect(step).toBeGreaterThan(mutate);
    expect(job).toMatch(/if: inputs\.verdict && failure\(\) && steps\.mutate\.outcome == 'failure'/);
    expect(job).toContain(
      '--report=.cache/mutation/report-${{ matrix.set }}.shard-${{ matrix.shard }}of${{ matrix.shards }}.json',
    );
    // The SHA is the candidate's target: the ref its shards checked out.
    expect(job).toContain('--sha=${{ inputs.ref }}');
    const candidate = readFileSync('.github/workflows/candidate.yml', 'utf8');
    const caller = candidate.slice(candidate.indexOf('\n  mutation:\n'), candidate.indexOf('\n  pack:\n'));
    expect(caller).toContain('ref: ${{ needs.target.outputs.sha }}');
    expect(caller).toMatch(/^ {6}verdict: true$/m);
  });
  it('tools/mutate.ts does not write it: that file is an input of every set, and editing it loses every cached shard', () => {
    expect(readFileSync('tools/mutate.ts', 'utf8')).not.toContain('mutation-verdict');
  });
});

// ——— The release command's side.
const job = (name: string, status = 'completed', conclusion = 'success', databaseId?: number) => ({
  name,
  status,
  conclusion,
  ...(databaseId ? { databaseId } : {}),
});
const verdicts: Verdict[] = [
  {
    job: 'mutation / mutation (studio-auth-1of1)',
    lines: [
      'studio-auth shard 1/1: 3 survivors not named in docs/dev/mutants.json',
      'studio-server/src/server/auth/gate.ts:152 condition true: !flight → true',
      'studio-server/src/server/auth/gate.ts:162 condition true: !(e instanceof DefinitiveRefusal) → true',
      'studio-server/src/server/auth/routes.ts:44 operator: > → >=',
    ],
  },
  {
    job: 'mutation / mutation (runs-1of1)',
    lines: [
      'runs shard 1/1: 1 survivor not named in docs/dev/mutants.json',
      'bridge/src/runs-store.ts:459 condition false: tenantId === undefined → false',
    ],
  },
];
const red = {
  status: 'completed',
  conclusion: 'failure',
  attempt: 1,
  jobs: [
    job('target'),
    job('mutation / mutation (studio-auth-1of1)', 'completed', 'failure', 1),
    job('mutation / mutation (runs-1of1)', 'completed', 'failure', 2),
    job('mutation / merge', 'completed', 'failure'),
    job('candidate-gate', 'completed', 'failure'),
  ],
};
const at = {
  id: 42527046788,
  version: '4.7.2',
  rerunAsked: false,
  waitedMs: 0,
};

describe('the wait, on a mutation verdict', () => {
  it('stops instead of re-running, with the run, each red shard, its survivors and the way on', () => {
    const step = candidateStep(red, { ...at, verdicts });
    expect(step.do).toBe('stop');
    if (step.do !== 'stop') return;
    const lines = step.error.split('\n');
    expect(lines[0]).toBe(
      `candidate run 42527046788: mutation survivors, not re-run (${URL}): a re-run measures the same inputs and finds them again`,
    );
    expect(step.error).toContain(
      '  ✖ mutation / mutation (studio-auth-1of1): studio-auth shard 1/1: 3 survivors not named',
    );
    expect(step.error).toContain('      studio-server/src/server/auth/routes.ts:44 operator: > → >=');
    expect(step.error).toContain('      bridge/src/runs-store.ts:459 condition false: tenantId === undefined → false');
    expect(step.error).toContain('also red: mutation / merge failure, candidate-gate failure');
    expect(step.error).toContain('https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Contribute-Mutation-Testing');
    expect(step.error).toContain("npm run release -- 4.7.2 --commit=<the fix's merge sha> --start-candidate");
  });
  it('stops at the first verdict, while the run still goes on', () => {
    const going = {
      status: 'in_progress',
      conclusion: '',
      jobs: [
        job('target'),
        job('mutation / mutation (runs-1of1)', 'completed', 'failure', 2),
        job('heavy (1)', 'in_progress', ''),
      ],
    };
    const step = candidateStep(going, { ...at, verdicts: [verdicts[1]!] });
    expect(step.do).toBe('stop');
    if (step.do === 'stop') expect(step.error).toContain('the run goes on on GitHub, not waited for');
  });
  it('mixed reds (another job red beside the survivors): still no re-run, the other red said', () => {
    const mixed = {
      ...red,
      jobs: [...red.jobs, job('connector-archive-e2e', 'completed', 'failure')],
    };
    const step = candidateStep(mixed, { ...at, verdicts });
    expect(step.do).toBe('stop');
    if (step.do === 'stop') expect(step.error).toContain('connector-archive-e2e failure');
  });
  it('a second attempt red on a verdict lists the survivors too, not only "failed again"', () => {
    const step = candidateStep({ ...red, attempt: 2 }, { ...at, verdicts });
    expect(step.do === 'stop' && step.error).toContain('mutation survivors, not re-run');
  });
  it('without a verdict (a shard cancelled, timed out, a runner lost): re-run once as before', () => {
    const died = {
      ...red,
      jobs: [job('target'), job('mutation / mutation (runs-1of1)', 'completed', 'timed_out', 2)],
    };
    expect(candidateStep(died, { ...at, verdicts: [] }).do).toBe('rerun');
    expect(candidateStep(died, at).do).toBe('rerun');
  });
  it('a green run is done, whatever an annotation said', () => {
    expect(candidateStep({ ...red, conclusion: 'success' }, { ...at, verdicts }).do).toBe('done');
  });
});

describe('the gate report, on a mutation verdict', () => {
  const g = candidateGate({
    version: '4.7.2',
    sha: SHA,
    startCandidate: false,
    run: { id: 42527046788, view: red, verdicts },
  });
  it('the candidate line says it, the survivors under it', () => {
    expect(g.state).toBe('red');
    expect(g.line).toBe(
      `the candidate of 5fc74d4: candidate run 42527046788: mutation survivors, not re-run (${URL}): a re-run measures the same inputs and finds them again`,
    );
    expect(g.detail).toContain('studio-server/src/server/auth/gate.ts:152 condition true: !flight → true');
    expect(g.verdict).toBe(true);
  });
  it('the report prints the survivors indented under the candidate line', () => {
    const r = gateReport([g], {
      version: '4.7.2',
      sha: SHA,
      dryRun: true,
      again: 'npm run release -- 4.7.2',
    });
    expect(r.refused).toBe(true);
    expect(r.lines).toContain('           studio-server/src/server/auth/routes.ts:44 operator: > → >=');
  });
});

describe('the review of #471 PR 4', () => {
  it('a mutant whose from or to spans lines is one line, its whitespace collapsed', () => {
    const report = {
      ...studioAuth,
      results: [
        mutant('a.ts', 7, 'condition true', 'x &&\n      y', 'true'),
        mutant('a.ts', 9, 'operator', '(a\n  || b)', 'c\n d'),
      ],
    };
    expect(shardVerdict({ report, known: [], incomplete: [], sha: SHA, same })).toEqual([
      'studio-auth shard 1/1: 2 survivors not named in docs/dev/mutants.json',
      'a.ts:7 condition true: x && y → true',
      'a.ts:9 operator: (a || b) → c d',
    ]);
  });
  it('an annotation titled `mutation verdict` at warning level is not a verdict', () => {
    expect(
      readVerdict([{ title: VERDICT_TITLE, annotation_level: 'warning', message: 'x: 1 survivor\na.ts:1 …' }]),
    ).toBeUndefined();
    expect(
      readVerdict([{ title: VERDICT_TITLE, annotation_level: 'notice', message: 'x: 1 survivor' }]),
    ).toBeUndefined();
  });
  it('the same verdict in several shards (mutants.json entries that do not hold) is said once, its shards listed', () => {
    const due = ['docs/dev/mutants.json: 1 entry does not hold', 'a.ts operator: > → >=: to be read again at 4.7.2'];
    const jobs = [
      'mutation / mutation (core-1of1)',
      'mutation / mutation (runs-1of1)',
      'mutation / mutation (reality-1of2)',
    ];
    const view = {
      status: 'completed',
      conclusion: 'failure',
      attempt: 1,
      jobs: jobs.map((n, i) => job(n, 'completed', 'failure', i + 1)),
    };
    const step = candidateStep(view, { ...at, verdicts: jobs.map((j) => ({ job: j, lines: due })) });
    expect(step.do).toBe('stop');
    if (step.do !== 'stop') return;
    expect(step.error).toContain(`  ✖ ${jobs.join(', ')}: docs/dev/mutants.json: 1 entry does not hold`);
    expect(step.error.split('a.ts operator: > → >=: to be read again at 4.7.2')).toHaveLength(2);
    expect(step.error).not.toContain('also red');
  });
});
