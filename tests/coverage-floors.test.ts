// The coverage floors (4.6.0, #405): data in tests/coverage-floors.json, read by vite.config.ts and the ratchet, so a
// floor raised moves no configuration a mutation set is keyed on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coverageFloors, FLOORS } from '../tools/coverage-floors';

describe('the coverage floors', () => {
  it("are the global floors and each group's files, flattened as Vitest's thresholds, without the reasons", () => {
    const floors = coverageFloors();
    expect(floors.lines).toBeTypeOf('number');
    expect(floors.branches).toBeTypeOf('number');
    expect(floors['src/engine/core/cond.ts']).toEqual({ branches: 100 });
    for (const [k, v] of Object.entries(floors))
      if (typeof v !== 'number')
        for (const [m, n] of Object.entries(v)) {
          expect(['lines', 'statements', 'functions', 'branches'], `${k} ${m}`).toContain(m);
          expect(n).toBeTypeOf('number');
        }
  });
  it('give every group a reason, and name each file once', () => {
    const raw = JSON.parse(readFileSync(FLOORS, 'utf8')) as { groups: { why: string; files: object }[] };
    const seen: string[] = [];
    for (const g of raw.groups) {
      expect(g.why.length).toBeGreaterThan(10);
      seen.push(...Object.keys(g.files));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
  it('are what vite.config.ts holds the coverage run to', async () => {
    const shard = process.env.VITEST_SHARD;
    delete process.env.VITEST_SHARD;
    try {
      const config = (await import('../vite.config')).default as { test: { coverage: { thresholds: unknown } } };
      expect(config.test.coverage.thresholds).toEqual(coverageFloors());
    } finally {
      if (shard !== undefined) process.env.VITEST_SHARD = shard;
    }
  });
});
