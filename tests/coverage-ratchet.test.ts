// The coverage ratchet's logic (4.7.0, #410 PR 2): which floors lag three points or more behind the measure, and
// `--write`, which raises each of them to two points under it in tests/coverage-floors.json, the rest unchanged.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { raiseFloors, ratchetSlack } from '../tools/coverage-floors';

const summary = {
  total: { lines: { pct: 78.23 }, statements: { pct: 77.06 }, functions: { pct: 74.14 }, branches: { pct: 72.74 } },
  '/repo/src/engine/core/world.ts': {
    lines: { pct: 99.1 },
    statements: { pct: 99 },
    functions: { pct: 100 },
    branches: { pct: 98 },
  },
};
const floors = {
  total: { why: 'the global floors', lines: 77, statements: 74, functions: 71, branches: 70 },
  groups: [{ why: 'the routes', files: { 'src/engine/core/world.ts': { lines: 98, branches: 86 } } }],
};

describe('the coverage ratchet', () => {
  it('names each floor three points or more under the measure, and only those', () => {
    expect(ratchetSlack(floors, summary)).toEqual([
      { where: 'total', metric: 'statements', floor: 74, got: 77.06 },
      { where: 'total', metric: 'functions', floor: 71, got: 74.14 },
      { where: 'src/engine/core/world.ts', metric: 'branches', floor: 86, got: 98 },
    ]);
  });

  it('`--write` raises each to two points under the measure, rounded down, and keeps everything else', () => {
    const raised = raiseFloors(floors, ratchetSlack(floors, summary));
    expect(raised.total).toEqual({ why: 'the global floors', lines: 77, statements: 75, functions: 72, branches: 70 });
    expect(raised.groups[0]).toEqual({
      why: 'the routes',
      files: { 'src/engine/core/world.ts': { lines: 98, branches: 96 } },
    });
    // Nothing left to raise afterwards, and never a floor above what was measured.
    expect(ratchetSlack(raised, summary)).toEqual([]);
    expect(floors.total.statements).toBe(74);
  });

  it('never lowers a floor', () => {
    const odd = { total: { lines: 90 }, groups: [] };
    expect(raiseFloors(odd, [{ where: 'total', metric: 'lines', floor: 90, got: 91 }]).total.lines).toBe(90);
  });

  it('the floors file is written as JSON with one-space indents, as committed', () => {
    const text = readFileSync('tests/coverage-floors.json', 'utf8');
    expect(`${JSON.stringify(JSON.parse(text), null, 1)}\n`).toBe(text);
  });

  it('the candidate only warns, a local release-check and CI hold the ratchet strict', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
    expect(scripts['release-check:ci']).toContain('npx tsx tools/coverage-ratchet.ts &&');
    expect(scripts['release-check:ci']).not.toContain('coverage-ratchet.ts --strict');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(
      'run: npx tsx tools/coverage-ratchet.ts --strict\n',
    );
  });
});
