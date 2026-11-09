// node --experimental-strip-types tools/schedule-guard.ts --event=<event> [--now=<ISO>] (4.5.6, #372): whether a
// scheduled run of nightly.yml still runs its jobs. GitHub starts scheduled runs hours after their cron times, every
// time: from 6 to 26 October 2026 the nightly (then 03:17 UTC) started 4 h 36 min to 7 h 44 min late and the weekly
// prove (then 04:00 UTC on Mondays, retired in #518) 5 h 37 min to 7 h 40 min late, in the working day, where their
// jobs took the runners from a release's candidate and its pull requests. The nightly's cron now starts the evening
// before (20:17 UTC), so those delays land it in the night; this guard skips a scheduled run that still starts in the
// Paris working day. The workflow's first job, `guard`, runs it; every other job needs it and runs only on
// `run=true`, so a skipped run takes one small runner for a few seconds and stays green. Only `schedule` is guarded: a
// run by hand (`workflow_dispatch`, the release's warm-up of the mutation cache among them) always runs.
// With `--workflow=<file> --sha=<commit> [--run-id=<id>] [--repo=<owner/name>]` (the nightly, #519), it also skips a
// scheduled run on the commit the last completed scheduled run already tested: its jobs give the same answer on the
// same commit. It reads the previous runs with `gh` (`actions: read`); if that read fails, the run goes on.
// Self-contained (no import but Node's): the job runs it without `npm ci`.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** The Paris working day, in minutes after midnight, Paris time, every day of the week (a release runs on Sundays). */
export const WORKDAY = { from: 7 * 60, to: 20 * 60 };

/** The last Sunday of a month (0-based) at 01:00 UTC, when the European Union changes its clocks. */
const lastSunday = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0, 1));
  return last.getTime() - last.getUTCDay() * 86_400_000;
};

/**
 * The time in Paris, in minutes after midnight: UTC+2 from the last Sunday of March to the last Sunday of October at
 * 01:00 UTC, UTC+1 otherwise. Computed, not read from Intl: the runner's Node needs no time zone data for it.
 */
export function parisMinutes(now: Date): number {
  const y = now.getUTCFullYear();
  const t = now.getTime();
  const offset = t >= lastSunday(y, 2) && t < lastSunday(y, 9) ? 120 : 60;
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + offset) % 1440;
}

export interface Decision {
  run: boolean;
  say: string;
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** A previous scheduled run, newest first (`gh run list --json databaseId,headSha,conclusion`). */
export interface PastRun {
  databaseId: number;
  headSha: string;
  conclusion: string;
  /** Its jobs past the guard ran: false for a run a guard skipped (green, it tested nothing). */
  tested?: boolean;
}

/** The conclusions of a run that went to its end; a cancelled run, or one still going, decided nothing. */
export const DONE = new Set(['success', 'failure']);

/** Whether a scheduled run on `sha` is worth it: not when the last completed run that tested a commit tested it. */
export function sameCommit({
  sha,
  runId,
  previous,
}: {
  sha: string;
  runId?: number;
  previous: PastRun[] | null;
}): Decision {
  if (previous === null) return { run: true, say: 'the previous scheduled runs could not be read (fail open)' };
  const last = previous.find((r) => r.databaseId !== runId && DONE.has(r.conclusion) && r.tested);
  if (last?.headSha === sha)
    return {
      run: false,
      say: `same commit as run ${last.databaseId} (${last.conclusion}): nothing to re-test. Every job is skipped and the report with them, so an open nightly-red issue stays open, unchanged (#519). Run it by hand (workflow_dispatch) if it is needed anyway.`,
    };
  return {
    run: true,
    say: last ? `a new commit since run ${last.databaseId}` : 'no previous scheduled run tested a commit',
  };
}

/**
 * Whether the run goes on: always, unless a `schedule` run starts in the Paris working day, or, given the previous
 * runs (`previous`; null when they could not be read), is on the commit the last one tested.
 */
export function decide({
  event,
  now,
  sha,
  runId,
  previous,
}: {
  event: string;
  now: Date;
  sha?: string;
  runId?: number;
  previous?: PastRun[] | null;
}): Decision {
  if (event !== 'schedule') return { run: true, say: `a ${event || 'non-scheduled'} run: never guarded` };
  const paris = parisMinutes(now);
  const day = `the Paris working day (${clock(WORKDAY.from)} to ${clock(WORKDAY.to)})`;
  if (paris >= WORKDAY.from && paris < WORKDAY.to)
    return {
      run: false,
      say: `this scheduled run started at ${clock(paris)} in Paris, in ${day}: every job is skipped, so it takes no runner from the day's pull requests and releases (#372). The next one runs as usual; run it by hand (workflow_dispatch) if it is needed now.`,
    };
  const night = `this scheduled run started at ${clock(paris)} in Paris, outside ${day}`;
  if (previous === undefined || !sha) return { run: true, say: `${night}: it runs` };
  const same = sameCommit({ sha, runId, previous });
  return same.run ? { run: true, say: `${night}, ${same.say}: it runs` } : same;
}

if (process.argv[1]?.endsWith('schedule-guard.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const nowArg = opt('now');
  const [event, workflow, sha] = [opt('event') ?? '', opt('workflow'), opt('sha')];
  const runId = Number(opt('run-id')) || undefined;
  let previous: PastRun[] | null | undefined;
  if (event === 'schedule' && workflow && sha) {
    const repo = ['-R', opt('repo') ?? process.env.GITHUB_REPOSITORY ?? ''];
    const gh = (...a: string[]) => JSON.parse(execFileSync('gh', [...a, ...repo], { encoding: 'utf8' }));
    try {
      previous = gh(
        'run',
        'list',
        '--workflow',
        workflow,
        '--event',
        'schedule',
        '-L',
        '20',
        '--json',
        'databaseId,headSha,conclusion',
      ) as PastRun[];
      // The jobs of each completed run, newest first, until one ran its jobs (a guard leaves only guard and report).
      for (const r of previous) {
        if (r.databaseId === runId || !DONE.has(r.conclusion)) continue;
        const jobs = gh('run', 'view', String(r.databaseId), '--json', 'jobs').jobs as {
          name: string;
          conclusion: string;
        }[];
        r.tested = jobs.some((j) => j.name !== 'guard' && j.name !== 'report' && j.conclusion !== 'skipped');
        if (r.tested) break;
      }
    } catch (e) {
      console.log(`::warning title=Previous runs unread::${(e as Error).message.split('\n')[0]}`);
      previous = null;
    }
  }
  const d = decide({ event, now: nowArg ? new Date(nowArg) : new Date(), sha, runId, previous });
  console.log(d.run ? `✔  ${d.say}` : `::notice title=Scheduled run skipped::${d.say}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Schedule guard\n\n${d.run ? '' : '**Skipped.** '}${d.say}\n`);
}
