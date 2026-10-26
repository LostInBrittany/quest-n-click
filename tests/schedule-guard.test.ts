// The scheduled workflows and the Paris working day (4.5.6, #372, tools/schedule-guard.ts). GitHub starts their
// scheduled runs hours after their cron times, every time: the nightly (then `17 3 * * *`) 4 h 36 min to 7 h 44 min
// late from 6 to 26 October 2026, the weekly prove (then `0 4 * * 1`) 5 h 37 min to 7 h 40 min late, so both ran in
// the working day and took the runners from the release's candidate and its pull requests. Their crons moved to the
// evening before, and a guard skips a scheduled run that still starts in the Paris working day. The decisions, the
// observed starts, then both workflows wired.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide, parisMinutes, WORKDAY } from '../tools/schedule-guard';

const at = (iso: string) => new Date(iso);

/** Every scheduled start of the nightly, 6 to 26 October 2026 (`gh run list -w nightly --json createdAt,event`). */
const NIGHTLY_STARTS = [
  '2026-10-06T10:28:21Z',
  '2026-10-07T10:22:41Z',
  '2026-10-08T10:42:46Z',
  '2026-10-09T10:41:48Z',
  '2026-10-10T09:57:48Z',
  '2026-10-11T10:07:04Z',
  '2026-10-12T11:01:30Z',
  '2026-10-13T10:44:56Z',
  '2026-10-14T08:49:47Z',
  '2026-10-15T08:24:44Z',
  '2026-10-16T08:17:26Z',
  '2026-10-17T07:53:13Z',
  '2026-10-18T08:08:22Z',
  '2026-10-19T09:02:25Z',
  '2026-10-20T08:40:02Z',
  '2026-10-21T08:41:04Z',
  '2026-10-22T08:43:24Z',
  '2026-10-23T08:39:07Z',
  '2026-10-24T08:14:09Z',
  '2026-10-25T08:32:01Z',
  '2026-10-26T09:05:13Z',
];
/** Every scheduled start of the weekly prove, the Mondays of 5 to 26 October 2026. */
const PROVE_STARTS = ['2026-10-05T11:11:49Z', '2026-10-12T11:40:28Z', '2026-10-19T09:36:58Z', '2026-10-26T09:44:39Z'];
/** The crons those runs were started from. */
const OLD = { nightly: { h: 3, m: 17 }, prove: { h: 4, m: 0 } };

/** Minutes between a start and its cron time that UTC day. */
const delay = (iso: string, cron: { h: number; m: number }) => {
  const d = at(iso);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() - (cron.h * 60 + cron.m) + 1440) % 1440;
};

describe('the time in Paris', () => {
  it('is UTC+1 in winter and UTC+2 in summer, switched on the last Sundays of March and October at 01:00 UTC', () => {
    expect(parisMinutes(at('2026-01-15T06:00:00Z'))).toBe(7 * 60);
    expect(parisMinutes(at('2026-07-15T06:00:00Z'))).toBe(8 * 60);
    // 2026: summer time from 29 March 01:00 UTC to 25 October 01:00 UTC.
    expect(parisMinutes(at('2026-03-29T00:59:00Z'))).toBe(1 * 60 + 59);
    expect(parisMinutes(at('2026-03-29T01:00:00Z'))).toBe(3 * 60);
    expect(parisMinutes(at('2026-10-25T00:59:00Z'))).toBe(2 * 60 + 59);
    expect(parisMinutes(at('2026-10-25T01:00:00Z'))).toBe(2 * 60);
    // 2027: 28 March and 31 October.
    expect(parisMinutes(at('2027-03-28T01:00:00Z'))).toBe(3 * 60);
    expect(parisMinutes(at('2027-10-31T00:30:00Z'))).toBe(2 * 60 + 30);
    expect(parisMinutes(at('2027-10-31T01:30:00Z'))).toBe(2 * 60 + 30);
    // Past midnight.
    expect(parisMinutes(at('2026-07-15T23:30:00Z'))).toBe(1 * 60 + 30);
  });
});

describe('the decision', () => {
  it('the working day in Paris is 07:00 to 20:00, every day', () => {
    expect(WORKDAY).toEqual({ from: 7 * 60, to: 20 * 60 });
  });

  it('skips every scheduled start observed in October 2026: all in the working day', () => {
    for (const iso of [...NIGHTLY_STARTS, ...PROVE_STARTS]) {
      const d = decide({ event: 'schedule', now: at(iso) });
      expect(d.run, iso).toBe(false);
      expect(d.say, iso).toMatch(/in the Paris working day/);
    }
    expect(decide({ event: 'schedule', now: at('2026-10-26T09:05:13Z') }).say).toMatch(/started at 10:05 in Paris/);
  });

  it('runs a scheduled start in the night or the evening, the bounds included on the night side', () => {
    for (const iso of ['2026-10-26T05:59:00Z', '2026-07-15T04:59:00Z', '2026-10-26T19:00:00Z', '2026-07-15T18:00:00Z'])
      expect(decide({ event: 'schedule', now: at(iso) }).run, iso).toBe(true);
    for (const iso of ['2026-10-26T06:00:00Z', '2026-07-15T05:00:00Z', '2026-10-26T18:59:00Z', '2026-07-15T17:59:00Z'])
      expect(decide({ event: 'schedule', now: at(iso) }).run, iso).toBe(false);
  });

  it('never guards a run by hand, nor any event but schedule', () => {
    for (const event of ['workflow_dispatch', 'push', 'pull_request', ''])
      expect(decide({ event, now: at('2026-10-26T14:00:00Z') }), event).toMatchObject({ run: true });
  });
});

describe('the scheduled workflows', () => {
  const wf = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');
  /** Each job's text, by its name (the 2-space keys after `jobs:`). */
  const jobsOf = (text: string) => {
    const body = text.slice(text.indexOf('\njobs:\n') + 6);
    const parts = body.split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/).filter((p) => /^ {2}[a-z]/.test(p));
    return new Map(parts.map((p) => [/^ {2}([a-z][a-z0-9-]*):/.exec(p)![1]!, p]));
  };
  const cronOf = (name: string) => {
    const m = /- cron: '(\d+) (\d+) \* \* (\*|\d)'/.exec(wf(name));
    expect(m, name).not.toBeNull();
    return { m: Number(m![1]), h: Number(m![2]), dow: m![3]! };
  };

  it('start in the evening before, so that every delay observed lands them in the night, summer or winter', () => {
    const cases = [
      { name: 'nightly', starts: NIGHTLY_STARTS, old: OLD.nightly },
      { name: 'prove', starts: PROVE_STARTS, old: OLD.prove },
    ];
    for (const { name, starts, old } of cases) {
      const cron = cronOf(name);
      expect(cron.h, name).toBeGreaterThanOrEqual(19);
      for (const iso of starts) {
        // The same delay after the new cron time, on the evening before the observed day, in October (summer time
        // until the 25th) and in midsummer.
        const day = at(iso);
        for (const month of [day.getUTCMonth(), 6]) {
          const evening = Date.UTC(day.getUTCFullYear(), month, day.getUTCDate() - 1, cron.h, cron.m);
          const start = new Date(evening + delay(iso, old) * 60_000);
          expect(decide({ event: 'schedule', now: start }).run, `${name}: ${iso} → ${start.toISOString()}`).toBe(true);
        }
      }
    }
    // The prove still runs once a week, on Sunday evening for the Monday.
    expect(cronOf('prove').dow).toBe('0');
    expect(cronOf('nightly').dow).toBe('*');
  });

  for (const name of ['nightly', 'prove']) {
    it(`${name}: a guard job decides before any other job`, () => {
      const jobs = jobsOf(wf(name));
      const guard = jobs.get('guard');
      expect(guard, name).toBeDefined();
      // Cheap: no `needs`, no `npm ci`, the tool run by Node alone, the event passed through env.
      expect(guard).not.toMatch(/^ {4}needs:/m);
      expect(guard).not.toMatch(/npm ci/);
      expect(guard).toContain('EVENT: ${{ github.event_name }}');
      expect(guard).toContain('node --experimental-strip-types --no-warnings tools/schedule-guard.ts');
      expect(guard).toMatch(/outputs:\n {6}run: \$\{\{ steps\.guard\.outputs\.run \}\}/);
      // Every other job waits for the guard and reads its answer, or waits for a job that does and runs only on its
      // success (the mutation shards and their merge).
      const guarded = new Set<string>();
      for (const [job, body] of jobs) {
        if (job === 'guard') continue;
        const needs = /^ {4}needs: (?:\[([^\]]*)\]|(\S+))$/m.exec(body);
        const list = needs ? (needs[1] ?? needs[2]!).split(',').map((s) => s.trim()) : [];
        const cond = /^ {4}if: (.*)$/m.exec(body)?.[1] ?? '';
        if (list.includes('guard')) {
          expect(cond, `${name} ${job}`).toContain("needs.guard.outputs.run == 'true'");
          guarded.add(job);
        } else {
          const via = list.find((j) => guarded.has(j));
          expect(via, `${name} ${job}: needs neither the guard nor a guarded job`).toBeDefined();
          if (cond.includes('always()')) expect(cond, `${name} ${job}`).toContain(`needs.${via}.result == 'success'`);
          guarded.add(job);
        }
      }
    });
  }
});
