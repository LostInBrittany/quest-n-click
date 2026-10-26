// node --experimental-strip-types tools/nightly-report.ts --open=<json> --reports=<dir> --known=<json> --run=<n>
//   --url=<run url> --sha=<sha> --event=<event> [--jobs=<all|mutation>] [--date=<YYYY-MM-DD>] --out=<dir>
// (4.5.6, #379): what the nightly's last job, `report`, does about the night's results. A red nightly told nobody but
// the cross on the Actions page: on 2026-10-26 one was found at the next release's candidate, a day late. Now a red
// night opens an issue labelled `nightly-red`, or comments on the open one (one issue per red streak, never one per
// night), and the first green night comments "green again" and closes it. The tool decides and writes the text; the
// workflow's `gh` does the writing, with `issues: write` on that job alone. It reads the jobs' results from
// `NIGHTLY_RESULTS` (`toJSON(needs)`), the open issues (`gh issue list --label nightly-red --json number`), and for a failed mutation
// gate the merged reports of the `mutation-merged` artefact, whose survivors not named in docs/dev/mutants.json it
// lists. A warm-up of the mutation cache (`-f jobs=mutation`) reports a red gate like a night (the candidate would
// fail on it), but a green one never closes the issue: it skipped every other job. It writes `<out>/action` (open,
// comment, close or none), `<out>/issues`, `<out>/title` and `<out>/body.md`. Self-contained (no import but Node's):
// the job runs it without `npm ci`.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The label of the issue; `gh label create --force` makes it when it opens one. */
export const LABEL = 'nightly-red';

/** The jobs whose failure is the mutation gate's: their text lists the surviving mutants. */
const MUTATION_JOBS = ['mutation-plan', 'mutation', 'mutation-merge'];
/** How many surviving mutants the text lists; the rest are counted. */
const MAX_MUTANTS = 20;

export interface Run {
  number: number;
  url: string;
  sha: string;
  /** The day of the run, UTC, YYYY-MM-DD. */
  date: string;
  event: string;
  /** The `jobs` input of a run by hand (`all` or `mutation`); empty for a scheduled run. */
  jobs: string;
}

export interface Survivor {
  set: string;
  file: string;
  line: number;
  operator: string;
  from: string;
  to: string;
  context: string;
}

type Mutant = Omit<Survivor, 'set'>;
type Known = { file: string; operator: string; from: string; to: string; context?: string };

/** Whether a named survivor names this mutant: tools/mutate.ts's `sameMutant`, copied (tests/nightly-report.test.ts). */
export const isKnown = (a: Mutant, k: Known) =>
  a.file === k.file &&
  a.operator === k.operator &&
  a.from === k.from &&
  a.to === k.to &&
  (k.context === undefined || a.context === k.context);

/** The surviving mutants of each failed set's merged report that docs/dev/mutants.json does not name. */
export function unexplained(
  reports: { set: string; status: string; results: (Mutant & { status: string })[] }[],
  known: Known[],
): Survivor[] {
  return reports
    .filter((r) => r.status === 'failed')
    .flatMap((r) =>
      r.results
        .filter((m) => m.status === 'survived' && !known.some((k) => isKnown(m, k)))
        .map(({ file, line, operator, from, to, context }) => ({
          set: r.set,
          file,
          line,
          operator,
          from,
          to,
          context,
        })),
    );
}

/** The jobs that failed (a timeout is a failure) or were cancelled; a skipped job is never red. */
export function redJobs(needs: Record<string, { result: string }>): { job: string; result: string }[] {
  return Object.entries(needs)
    .filter(([, n]) => n.result === 'failure' || n.result === 'cancelled')
    .map(([job, n]) => ({ job, result: n.result }));
}

/** A run by hand of the mutation jobs only: the warm-up of the cache before a release (#329). */
const isWarmup = (run: Run) => run.event === 'workflow_dispatch' && run.jobs === 'mutation';

export interface Action {
  action: 'open' | 'comment' | 'close' | 'none';
  /** The issues to comment on (the oldest open) or to close (every open one). */
  issues: number[];
  title?: string;
  body: string;
  /** One line for the log and the run's summary. */
  say: string;
}

const short = (sha: string) => sha.slice(0, 7);
const runLink = (run: Run) => `[run #${run.number}](${run.url})`;
const kind = (run: Run) =>
  isWarmup(run)
    ? 'a warm-up of the mutation cache (`-f jobs=mutation`: the mutation jobs only)'
    : run.event === 'schedule'
      ? 'a scheduled run'
      : 'a run by hand';

function redSection(run: Run, red: { job: string; result: string }[], survivors: Survivor[]): string {
  const lines = [
    `### Red on ${run.date}: ${runLink(run)}`,
    '',
    `Commit \`${run.sha}\`, ${kind(run)}.`,
    '',
    '| Job | Result |',
    '|---|---|',
    ...red.map((r) => `| \`${r.job}\` | ${r.result} |`),
  ];
  if (red.some((r) => MUTATION_JOBS.includes(r.job))) {
    lines.push('');
    if (survivors.length) {
      lines.push(
        `**Surviving mutants not named in \`docs/dev/mutants.json\`** (the run's \`mutation-merged\` artefact):`,
        '',
        ...survivors
          .slice(0, MAX_MUTANTS)
          .map(
            (s) =>
              `- \`${s.set}\`: \`${s.file}:${s.line}\` ${s.operator}: \`${s.from}\` → \`${s.to}\` (\`${s.context}\`)`,
          ),
      );
      if (survivors.length > MAX_MUTANTS) lines.push(`- and ${survivors.length - MAX_MUTANTS} more, in the artefact`);
    } else {
      lines.push(
        `The mutation jobs are red and no merged report names a surviving mutant (a shard missing or cancelled, a merge refused, or the plan failed): see the \`mutation\` and \`mutation-merge\` jobs of ${runLink(run)}.`,
      );
    }
  }
  return lines.join('\n');
}

/** Open, comment, close or nothing, and the text. */
export function decide({
  needs,
  run,
  open,
  survivors,
}: {
  needs: Record<string, { result: string }>;
  run: Run;
  open: { number: number }[];
  survivors: Survivor[];
}): Action {
  const red = redJobs(needs);
  const issues = open.map((i) => i.number).sort((a, b) => a - b);
  if (!red.length) {
    if (!issues.length) return { action: 'none', issues: [], body: '', say: `green on ${run.url}, no issue open` };
    if (isWarmup(run))
      return {
        action: 'none',
        issues: [],
        body: '',
        say: `a green warm-up of the mutation cache skipped every other job: issue #${issues[0]} stays open until a full nightly is green`,
      };
    return {
      action: 'close',
      issues,
      body: `Green again on ${runLink(run)} (${run.date}, commit \`${short(run.sha)}\`).`,
      say: `green again on ${run.url}: closing ${issues.map((n) => `#${n}`).join(', ')}`,
    };
  }
  const section = redSection(run, red, survivors);
  const jobs = red.map((r) => r.job).join(', ');
  if (issues.length)
    return { action: 'comment', issues: [issues[0]!], body: section, say: `red (${jobs}): a comment on #${issues[0]}` };
  return {
    action: 'open',
    issues: [],
    title: `The nightly is red since ${run.date}`,
    body: [
      `The nightly is red. The nightly's \`report\` job opened this issue (\`tools/nightly-report.ts\`, #379): each red night adds a comment here, and the first green nightly closes it. A warm-up of the mutation cache reports a red gate here too, but never closes it.`,
      '',
      section,
    ].join('\n'),
    say: `red (${jobs}): a new issue labelled ${LABEL}`,
  };
}

if (process.argv[1]?.endsWith('nightly-report.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const need = (k: string) => {
    const v = opt(k);
    if (v === undefined) {
      console.error(`✖  --${k}= is required`);
      process.exit(2);
    }
    return v;
  };
  const needs = JSON.parse(process.env.NIGHTLY_RESULTS ?? 'null') as Record<string, { result: string }> | null;
  if (!needs) {
    console.error('✖  NIGHTLY_RESULTS (the jobs’ results, `toJSON(needs)`) is not set');
    process.exit(2);
  }
  const run: Run = {
    number: Number(need('run')),
    url: need('url'),
    sha: need('sha'),
    date: opt('date') ?? new Date().toISOString().slice(0, 10),
    event: need('event'),
    jobs: opt('jobs') ?? '',
  };
  const open = JSON.parse(readFileSync(need('open'), 'utf8')) as { number: number }[];
  // The merged reports, wherever the artefact put them (`merged/.cache/mutation/report-<set>.json`); none when the
  // gate passed or its merge never wrote one.
  const reports: Parameters<typeof unexplained>[0] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true }))
      if (f.isDirectory()) walk(join(d, f.name));
      else if (/^report-[a-z0-9-]+\.json$/.test(f.name))
        reports.push(JSON.parse(readFileSync(join(d, f.name), 'utf8')));
  };
  const dir = opt('reports');
  if (dir && existsSync(dir)) walk(dir);
  const known = JSON.parse(readFileSync(opt('known') ?? 'docs/dev/mutants.json', 'utf8')) as Known[];
  const d = decide({ needs, run, open, survivors: unexplained(reports, known) });
  const out = need('out');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'action'), d.action);
  writeFileSync(join(out, 'issues'), d.issues.join(' '));
  writeFileSync(join(out, 'title'), d.title ?? '');
  writeFileSync(join(out, 'body.md'), `${d.body}\n`);
  console.log(`${d.action === 'none' || d.action === 'close' ? '✔' : '✖'}  ${d.say}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### The night's issue\n\n${d.say}\n${d.body ? `\n${d.body}\n` : ''}`,
    );
}
