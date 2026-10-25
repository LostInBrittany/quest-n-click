// The unit suite's shards by duration (4.5.5, #349, tools/unit-shards.ts): vitest's own split gives each shard as many
// files, in the order of a hash of their paths, and 4.5.4's shard 4 finished in two minutes when the others took five.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignShards,
  byDuration,
  DURATIONS_FILE,
  PARALLEL,
  readDurations,
  recordDurations,
  shardTime,
} from '../tools/unit-shards';

const load = (shards: string[][], d: Record<string, number>, fallback = 0) =>
  shards.map((s) => s.reduce((t, f) => t + (d[f] ?? fallback), 0));

describe('assignShards', () => {
  it('puts every file in exactly one shard', () => {
    const files = Array.from({ length: 23 }, (_, i) => `tests/f${i}.test.ts`);
    const d = Object.fromEntries(files.map((f, i) => [f, (i * 37) % 11]));
    const shards = assignShards(files, d, 4);
    expect(shards).toHaveLength(4);
    expect(shards.flat().sort()).toEqual([...files].sort());
  });

  it('gives the same shards whatever order the files come in (every shard computes the split alone)', () => {
    const files = ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts', 'tests/d.test.ts', 'tests/e.test.ts'];
    const d = { 'tests/a.test.ts': 5, 'tests/b.test.ts': 5, 'tests/c.test.ts': 3, 'tests/d.test.ts': 3 };
    expect(assignShards([...files].reverse(), d, 2)).toEqual(assignShards(files, d, 2));
  });

  it('balances by duration, not by count: one long file alone against many short ones', () => {
    const files = ['tests/long.test.ts', ...Array.from({ length: 6 }, (_, i) => `tests/s${i}.test.ts`)];
    const d: Record<string, number> = { 'tests/long.test.ts': 60 };
    for (let i = 0; i < 6; i++) d[`tests/s${i}.test.ts`] = 10;
    const shards = assignShards(files, d, 2);
    expect(shards.find((s) => s.includes('tests/long.test.ts'))).toEqual(['tests/long.test.ts']);
    expect(load(shards, d)).toEqual([60, 60]);
  });

  it('counts a file the table does not know as the median of those it knows', () => {
    const d = { 'tests/a.test.ts': 1, 'tests/b.test.ts': 2, 'tests/c.test.ts': 100 };
    // a new file (median 2) goes with the lighter side, beside `a`, not with `c`.
    const shards = assignShards([...Object.keys(d), 'tests/new.test.ts'], d, 2);
    expect(shards.find((s) => s.includes('tests/new.test.ts'))).not.toContain('tests/c.test.ts');
  });

  it('counts that a shard cannot end before its longest file: the work goes where it is not waited for', () => {
    // 100 on one shard; 7 × 25 = 175 elsewhere takes 87.5 at PARALLEL 2: the long file's shard gets none of them.
    expect(PARALLEL).toBe(2);
    const d: Record<string, number> = { 'tests/long.test.ts': 100 };
    for (let i = 0; i < 7; i++) d[`tests/s${i}.test.ts`] = 25;
    const shards = assignShards(Object.keys(d), d, 2);
    expect(shards[0]).toEqual(['tests/long.test.ts']);
    expect(shardTime(100, 100)).toBe(100);
    expect(shardTime(25, 200)).toBe(100);
  });

  it('runs the longest recorded file first, an unknown one as the median, ties by path', () => {
    const d = { 'tests/a.test.ts': 1, 'tests/b.test.ts': 50, 'tests/c.test.ts': 9 };
    expect(byDuration(['tests/a.test.ts', 'tests/new.test.ts', 'tests/c.test.ts', 'tests/b.test.ts'], d)).toEqual([
      'tests/b.test.ts',
      'tests/c.test.ts',
      'tests/new.test.ts',
      'tests/a.test.ts',
    ]);
  });

  it('works with an empty table and with more shards than files', () => {
    expect(assignShards(['tests/a.test.ts'], {}, 3)).toEqual([['tests/a.test.ts'], [], []]);
  });
});

describe('recordDurations', () => {
  it("keeps each file's duration from vitest's JSON report, in milliseconds rounded to the tenth of a second", () => {
    const report = {
      testResults: [
        { name: '/repo/tests/a.test.ts', startTime: 1000, endTime: 3449 },
        { name: '/repo/games/demo/tests/b.test.ts', startTime: 0, endTime: 20 },
      ],
    };
    expect(recordDurations([report], '/repo')).toEqual({
      'games/demo/tests/b.test.ts': 100,
      'tests/a.test.ts': 2400,
    });
  });
  it('takes the median of several reports', () => {
    const r = (ms: number) => ({ testResults: [{ name: '/repo/tests/a.test.ts', startTime: 0, endTime: ms }] });
    expect(recordDurations([r(1000), r(9000), r(2000)], '/repo')).toEqual({ 'tests/a.test.ts': 2000 });
  });
});

describe("the repository's table and its wiring", () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const excluded = [...scripts['test:unit']!.matchAll(/--exclude (\S+)/g)].map((m) => m[1]!);
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.test.ts') ? [join(d, e.name)] : [],
    );
  const files = walk('tests').filter((f) => !excluded.includes(f));

  it('vite.config.ts shards the suite with the duration sequencer', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toMatch(/sequence:\s*\{\s*sequencer:\s*DurationSequencer\s*\}/);
    expect(config).toContain("from './tools/unit-shards.ts'");
  });

  it('the recorded table splits the suite into four shards of the same time, files spread', () => {
    const d = readDurations();
    expect(Object.keys(d).length, DURATIONS_FILE).toBeGreaterThan(100);
    const known = Object.values(d).sort((a, b) => a - b);
    const median = known[Math.floor(known.length / 2)]!;
    const shards = assignShards(files, d, 4);
    const times = shards.map((s) => {
      const v = s.map((f) => d[f] ?? median);
      return shardTime(
        Math.max(...v),
        v.reduce((a, b) => a + b, 0),
      );
    });
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(1.1);
    // No shard holds twice another's files: each file's import costs too, which the table does not count.
    const counts = shards.map((s) => s.length);
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(2);
  });

  it('loads no vitest at import time: the module ships in the package beside vite.config.ts', () => {
    const src = readFileSync('tools/unit-shards.ts', 'utf8');
    expect(src).not.toMatch(/^import (?!type )[^\n]*from 'vitest/m);
  });
});
