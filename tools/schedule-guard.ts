// node --experimental-strip-types tools/schedule-guard.ts --event=<event> [--now=<ISO>] (4.5.6, #372): whether a
// scheduled run of nightly.yml or prove.yml still runs its jobs. GitHub starts their scheduled runs hours after their
// cron times, every time: from 6 to 26 October 2026 the nightly (then 03:17 UTC) started 4 h 36 min to 7 h 44 min late
// and the weekly prove (then 04:00 UTC on Mondays) 5 h 37 min to 7 h 40 min late, in the working day, where their jobs
// took the runners from a release's candidate and its pull requests. Their crons now start the evening before (20:17
// UTC, Sunday 20:00 UTC), so those delays land them in the night; this guard skips a scheduled run that still starts
// in the Paris working day. The workflows' first job, `guard`, runs it; every other job needs it and runs only on
// `run=true`, so a skipped run takes one small runner for a few seconds and stays green. Only `schedule` is guarded: a
// run by hand (`workflow_dispatch`, the release's warm-up of the mutation cache among them) always runs.
// Self-contained (no import but Node's): the job runs it without `npm ci`.
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

/** Whether the run goes on: always, unless a `schedule` run starts in the Paris working day. */
export function decide({ event, now }: { event: string; now: Date }): Decision {
  if (event !== 'schedule') return { run: true, say: `a ${event || 'non-scheduled'} run: never guarded` };
  const paris = parisMinutes(now);
  const day = `the Paris working day (${clock(WORKDAY.from)} to ${clock(WORKDAY.to)})`;
  return paris >= WORKDAY.from && paris < WORKDAY.to
    ? {
        run: false,
        say: `this scheduled run started at ${clock(paris)} in Paris, in ${day}: every job is skipped, so it takes no runner from the day's pull requests and releases (#372). The next one runs as usual; run it by hand (workflow_dispatch) if it is needed now.`,
      }
    : { run: true, say: `this scheduled run started at ${clock(paris)} in Paris, outside ${day}: it runs` };
}

if (process.argv[1]?.endsWith('schedule-guard.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const nowArg = opt('now');
  const d = decide({ event: opt('event') ?? '', now: nowArg ? new Date(nowArg) : new Date() });
  console.log(d.run ? `✔  ${d.say}` : `::notice title=Scheduled run skipped in the working day::${d.say}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Schedule guard\n\n${d.run ? '' : '**Skipped.** '}${d.say}\n`);
}
