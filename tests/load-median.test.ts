// Load figures as medians (4.1.20 PR 3, plan §8.3, tools/load-median.ts): three loads of a store, each its p95, read as
// their median with minimum and maximum; compared only with a baseline of the same runner and protocol; more than
// 25 % slower is an alert, a failure only past the absolute budget or when all three loads are that much slower.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type BaselineEntry, judgeLoad } from '../tools/load-median';

const runner = { os: 'Linux', image: 'ubuntu24' };
const protocol = { instances: 3, players: 1000, proposals: 50000, concurrency: 64 };
const load = (p95: number, over: Record<string, number> = {}) => ({ ...protocol, latencyMs: { p95 }, ...over });
const base: BaselineEntry = { p95Ms: 400, runner, protocol, source: 'test' };

describe('three loads, one figure', () => {
  it('is the median of the three p95, with their minimum and maximum, the runner and protocol named', () => {
    const r = judgeLoad('proposals', [load(410), load(390), load(700)], runner, base);
    expect(r).toMatchObject({ p95Ms: [410, 390, 700], medianMs: 410, minMs: 390, maxMs: 700, runner, protocol });
    expect(r.baseline).toEqual({ p95Ms: 400, source: 'test', ratio: 1.02 });
    expect(r.alert).toBe(false);
    expect(r.failed).toEqual([]);
  });

  it('alerts past 25 % on the median, fails only when all three are past it or past the budget', () => {
    const two = judgeLoad('proposals', [load(510), load(520), load(380)], runner, base);
    expect(two.alert).toBe(true);
    expect(two.failed).toEqual([]);
    const three = judgeLoad('proposals', [load(510), load(520), load(505)], runner, base);
    expect(three.failed[0]).toMatch(/every load 25 % slower than the baseline .*reproduced/);
    // At 25 % exactly: no alert (the trend is "more than").
    expect(judgeLoad('proposals', [load(500), load(500), load(500)], runner, base).alert).toBe(false);
    const budget = judgeLoad('proposals', [load(300), load(1001), load(300)], runner, base);
    expect(budget.failed).toEqual(['a p95 above the budget of 1000 ms (300, 1001, 300)']);
  });

  it('compares with no baseline of another runner or protocol, and says why', () => {
    const other = judgeLoad('proposals', [load(900), load(900), load(900)], { os: 'Linux', image: 'ubuntu22' }, base);
    expect(other.baseline).toEqual({ refused: 'the baseline ran on Linux/ubuntu24, not Linux/ubuntu22' });
    expect(other.alert).toBe(false);
    expect(other.failed).toEqual([]);
    const proto = judgeLoad(
      'proposals',
      [load(1, { proposals: 10 }), load(1, { proposals: 10 }), load(1, { proposals: 10 })],
      runner,
      base,
    );
    expect((proto.baseline as { refused: string }).refused).toMatch(/another protocol/);
    expect(judgeLoad('proposals', [load(1), load(1), load(1)], runner, undefined).baseline).toEqual({
      refused: 'no baseline for this store and load',
    });
  });

  it('refuses anything but three loads of one protocol, each with its p95', () => {
    expect(() => judgeLoad('proposals', [load(1), load(1)], runner, base)).toThrow(/2 loads, not 3/);
    expect(() => judgeLoad('proposals', [load(1), load(1), load(1, { players: 5 })], runner, base)).toThrow(
      /other protocols/,
    );
    expect(() => judgeLoad('leaderboard', [{}, {}, {}], runner, undefined)).toThrow(/no p95/);
  });

  it('has a baseline of both stores and both loads, on the candidate runner', () => {
    const b = JSON.parse(readFileSync('docs/dev/baselines/load.json', 'utf8'));
    for (const s of ['sqlite', 'postgres'])
      for (const k of ['proposals', 'leaderboard']) expect(b.stores[s][k].runner).toEqual(runner);
  });
});
