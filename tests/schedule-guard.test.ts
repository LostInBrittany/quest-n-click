// The late-start guard of the scheduled workflows (4.5.6, #372, tools/schedule-guard.ts): on 2026-10-26 GitHub
// started the nightly at 09:05 UTC and the weekly prove at 09:44 UTC, six hours after their cron times, and their jobs
// took the runners from a release's candidate. A scheduled run that starts more than MAX_DELAY_MINUTES after its cron
// time skips every job but the guard; a run by hand always runs. The table of decisions, then both workflows wired.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide, lastCronTime, MAX_DELAY_MINUTES } from '../tools/schedule-guard';

const NIGHTLY = '17 3 * * *';
const PROVE = '0 4 * * 1';
const at = (iso: string) => new Date(iso);

describe('the last cron time before a start', () => {
  it('is the same day when the start is after it, the day before when it is not', () => {
    expect(lastCronTime(NIGHTLY, at('2026-10-26T09:05:00Z'))?.toISOString()).toBe('2026-10-26T03:17:00.000Z');
    expect(lastCronTime(NIGHTLY, at('2026-10-27T00:30:00Z'))?.toISOString()).toBe('2026-10-26T03:17:00.000Z');
    expect(lastCronTime(NIGHTLY, at('2026-10-26T03:17:00Z'))?.toISOString()).toBe('2026-10-26T03:17:00.000Z');
  });

  it("is the last Monday's for the weekly prove", () => {
    // 2026-10-26 is a Monday.
    expect(lastCronTime(PROVE, at('2026-10-26T09:44:00Z'))?.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(lastCronTime(PROVE, at('2026-10-27T01:00:00Z'))?.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(lastCronTime(PROVE, at('2026-10-26T03:59:00Z'))?.toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });

  it('reads lists and Sunday as 7; anything else is not understood (null)', () => {
    expect(lastCronTime('0,30 3 * * *', at('2026-10-26T03:45:00Z'))?.toISOString()).toBe('2026-10-26T03:30:00.000Z');
    expect(lastCronTime('0 4 * * 7', at('2026-10-26T09:00:00Z'))?.toISOString()).toBe('2026-10-25T04:00:00.000Z');
    expect(lastCronTime('0 4 * * 1,3', at('2026-10-29T09:00:00Z'))?.toISOString()).toBe('2026-10-28T04:00:00.000Z');
    for (const cron of [
      '',
      '*/5 * * * *',
      '0 4 1 * *',
      '0 4 * 1 *',
      '0 4-6 * * *',
      'nonsense',
      '0 25 * * *',
      '61 3 * * *',
    ])
      expect(lastCronTime(cron, at('2026-10-26T09:00:00Z')), cron).toBeNull();
  });
});

describe('the decision', () => {
  it('skips the runs of 2026-10-26: the nightly 5 h 48 min late, the prove 5 h 44 min late', () => {
    const nightly = decide({ event: 'schedule', cron: NIGHTLY, now: at('2026-10-26T09:05:00Z') });
    expect(nightly).toMatchObject({ run: false, delayMinutes: 348 });
    expect(nightly.say).toMatch(/started 5 h 48 min after its cron time \(03:17 UTC\), more than the 2 h allowed/);
    const prove = decide({ event: 'schedule', cron: PROVE, now: at('2026-10-26T09:44:00Z') });
    expect(prove).toMatchObject({ run: false, delayMinutes: 344 });
  });

  it('runs a scheduled run on time or late within the limit, the limit itself included', () => {
    expect(decide({ event: 'schedule', cron: NIGHTLY, now: at('2026-10-26T03:40:00Z') })).toMatchObject({
      run: true,
      delayMinutes: 23,
    });
    const limit = new Date(Date.parse('2026-10-26T03:17:00Z') + MAX_DELAY_MINUTES * 60_000);
    expect(decide({ event: 'schedule', cron: NIGHTLY, now: limit }).run).toBe(true);
    expect(decide({ event: 'schedule', cron: NIGHTLY, now: new Date(limit.getTime() + 60_000) }).run).toBe(false);
  });

  it('skips a run late past midnight (the day before is its cron time)', () => {
    expect(decide({ event: 'schedule', cron: NIGHTLY, now: at('2026-10-27T00:30:00Z') })).toMatchObject({
      run: false,
      delayMinutes: 21 * 60 + 13,
    });
  });

  it('never guards a run by hand, nor any event but schedule', () => {
    for (const event of ['workflow_dispatch', 'push', 'pull_request', ''])
      expect(decide({ event, cron: '', now: at('2026-10-26T14:00:00Z') }), event).toMatchObject({ run: true });
  });

  it('runs, with a warning, when the cron is missing or not understood: a guard that cannot judge never skips', () => {
    for (const cron of ['', undefined, '*/5 * * * *']) {
      const d = decide({ event: 'schedule', cron, now: at('2026-10-26T14:00:00Z') });
      expect(d.run, String(cron)).toBe(true);
      expect(d.warn, String(cron)).toBe(true);
    }
  });

  it('allows two hours: the weekly prove then starts by 06:00 UTC at the latest, 07:00 in Paris in winter', () => {
    expect(MAX_DELAY_MINUTES).toBe(120);
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

  for (const name of ['nightly', 'prove']) {
    it(`${name}: its crons are understood, and a guard job decides before any other job`, () => {
      const text = wf(name);
      const crons = [...text.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]!);
      expect(crons.length, name).toBeGreaterThan(0);
      for (const c of crons) expect(lastCronTime(c, at('2026-10-26T12:00:00Z')), c).not.toBeNull();
      const jobs = jobsOf(text);
      const guard = jobs.get('guard');
      expect(guard, name).toBeDefined();
      // Cheap: no `needs`, no `npm ci`, the tool run by Node alone, the event and the cron passed through env.
      expect(guard).not.toMatch(/^ {4}needs:/m);
      expect(guard).not.toMatch(/npm ci/);
      expect(guard).toContain('EVENT: ${{ github.event_name }}');
      expect(guard).toContain('CRON: ${{ github.event.schedule }}');
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
