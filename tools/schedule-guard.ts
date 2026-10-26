// node --experimental-strip-types tools/schedule-guard.ts --event=<event> --cron='<cron>' [--now=<ISO>] (4.5.6, #372):
// whether a scheduled run of nightly.yml or prove.yml still runs its jobs. GitHub does not guarantee a schedule's start
// time: on 2026-10-26 it started the nightly (03:17 UTC) at 09:05 and the weekly prove (04:00 UTC on Mondays) at
// 09:44, in the working day, and their jobs took the runners from a release's candidate and its pull requests. The
// workflows' first job, `guard`, runs this; every other job needs it and runs only on `run=true`, so a skipped run takes
// one small runner for a few seconds and stays green. Only `schedule` is guarded: a run by hand (`workflow_dispatch`,
// the release's warm-up of the mutation cache among them) always runs. A cron this file does not understand, or none,
// runs too, with a warning: a guard that cannot judge never skips. Self-contained (no import but Node's): the job runs
// it without `npm ci`.
import { appendFileSync } from 'node:fs';

/**
 * How late a scheduled run may start (minutes after its cron time) and still run. GitHub's usual delay is minutes,
 * rarely past the hour; the late starts that hurt are hours. With two hours the nightly (03:17 UTC) starts by 05:17 UTC
 * and the weekly prove (04:00 UTC) by 06:00 UTC: 07:00 in Paris in winter (UTC+1), 08:00 in summer (UTC+2), before the
 * working day.
 */
export const MAX_DELAY_MINUTES = 120;

/** A cron field of numbers: `*` (any), or a comma list within [lo, hi]; null for anything else (ranges, steps). */
function field(text: string, lo: number, hi: number): number[] | '*' | null {
  if (text === '*') return '*';
  if (!/^\d+(,\d+)*$/.test(text)) return null;
  const values = text.split(',').map(Number);
  return values.every((v) => v >= lo && v <= hi) ? values : null;
}

/**
 * The last time at or before `now` that `cron` (five fields, UTC) fires, or null when this file does not understand it:
 * minutes and hours as numbers or lists, day of month and month `*`, day of week `*` or a list (0 and 7 both Sunday).
 * Enough for the crons the workflows use, and the test reads every one of them.
 */
export function lastCronTime(cron: string, now: Date): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minutes = field(parts[0]!, 0, 59);
  const hours = field(parts[1]!, 0, 23);
  const dows = field(parts[4]!, 0, 7);
  if (minutes === null || minutes === '*' || hours === null || hours === '*' || dows === null) return null;
  if (parts[2] !== '*' || parts[3] !== '*') return null;
  const days = dows === '*' ? null : new Set(dows.map((d) => d % 7));
  let best: Date | null = null;
  // Eight days back cover a weekly cron whose time of day is after `now`'s.
  for (let back = 0; back <= 8; back++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
    if (days && !days.has(day.getUTCDay())) continue;
    for (const h of hours)
      for (const m of minutes) {
        const t = new Date(day.getTime() + (h * 60 + m) * 60_000);
        if (t <= now && (!best || t > best)) best = t;
      }
    if (best) return best;
  }
  return best;
}

export interface Decision {
  run: boolean;
  /** Minutes between the cron time and the start, when judged. */
  delayMinutes?: number;
  /** The guard could not judge (no cron, or one it does not understand): it runs, and says why. */
  warn?: boolean;
  say: string;
}

const hm = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
const clock = (d: Date) => d.toISOString().slice(11, 16);

/** Whether the run goes on: always unless a `schedule` run started more than `maxDelay` minutes after its cron time. */
export function decide({
  event,
  cron,
  now,
  maxDelay = MAX_DELAY_MINUTES,
}: {
  event: string;
  cron?: string;
  now: Date;
  maxDelay?: number;
}): Decision {
  if (event !== 'schedule') return { run: true, say: `a ${event || 'non-scheduled'} run: never guarded` };
  const due = cron ? lastCronTime(cron, now) : null;
  if (!due)
    return {
      run: true,
      warn: true,
      say: `a scheduled run whose cron (${cron ? `'${cron}'` : 'none'}) the guard does not understand: it runs`,
    };
  const delayMinutes = Math.floor((now.getTime() - due.getTime()) / 60_000);
  const late = `started ${hm(delayMinutes)} after its cron time (${clock(due)} UTC)`;
  return delayMinutes > maxDelay
    ? {
        run: false,
        delayMinutes,
        say: `this scheduled run ${late}, more than the ${hm(maxDelay)} allowed: every job is skipped, so it takes no runner in the working day (#372). The next one runs as usual; run it by hand (workflow_dispatch) if it is needed now.`,
      }
    : { run: true, delayMinutes, say: `this scheduled run ${late}: within the ${hm(maxDelay)} allowed, it runs` };
}

if (process.argv[1]?.endsWith('schedule-guard.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const nowArg = opt('now');
  const d = decide({ event: opt('event') ?? '', cron: opt('cron'), now: nowArg ? new Date(nowArg) : new Date() });
  if (d.warn) console.log(`::warning title=schedule guard::${d.say}`);
  else if (!d.run) console.log(`::notice title=Late scheduled run skipped::${d.say}`);
  else console.log(`✔  ${d.say}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Schedule guard\n\n${d.run ? '' : '**Skipped.** '}${d.say}\n`);
}
