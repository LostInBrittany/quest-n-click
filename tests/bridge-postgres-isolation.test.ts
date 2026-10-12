// The tests that judge the Postgres adapter (4.1.20 PR 2a, plan §7.2): before it, the set `reality-store-postgres`
// could not be measured on main. Its files shared one database (the leaderboard read the rows of the tests before it, a
// worker of another file claimed the admission test's queued runs), ran side by side (more connections than a server
// gives), and CI's `bridge-postgres` job played five of its eight files from a list of its own. These checks keep it so.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERIAL, TESTS } from '../tools/mutation-sets';
import { readdirSync } from 'node:fs';

const PG_TESTS = TESTS['reality-store-postgres'];
const text = (f: string) => readFileSync(f, 'utf8');

describe('the tests that run against a real Postgres', () => {
  it('are all in the set reality-store-postgres: a file that reads BRIDGE_PG_URL elsewhere would never run on Postgres', () => {
    const reading = readdirSync('tests')
      .filter((f) => f.endsWith('.test.ts') && f !== 'bridge-postgres-isolation.test.ts')
      .map((f) => `tests/${f}`)
      .filter((f) => text(f).includes('process.env.BRIDGE_PG_URL'));
    expect(reading.length).toBeGreaterThan(0);
    for (const f of reading) expect(PG_TESTS, f).toContain(f);
  });

  it('each open a database of their own, never the server’s shared one', () => {
    for (const f of PG_TESTS) {
      const src = text(f);
      // A store, a pool or a process handed the shared URL itself (a URL built from it with another database is a
      // database of the test's own, as tests/fixtures/pg-database.ts makes).
      expect(src, f).not.toMatch(/\.open\(\s*(PG_URL!?|process\.env\.BRIDGE_PG_URL!?)\s*,/);
      expect(src, f).not.toMatch(/BRIDGE_STORE:\s*process\.env\.BRIDGE_PG_URL/);
    }
  });

  it('run one file after the other, in mutation as in CI', () => {
    expect(SERIAL).toContain('reality-store-postgres');
    expect(text('vitest.mutation.config.ts')).toMatch(/SERIAL\.includes\(set\) \? \{ fileParallelism: false \}/);
    const ci = text('.github/workflows/ci.yml');
    const job = ci.slice(ci.indexOf('\n  bridge-postgres:'), ci.indexOf('\n  reality:'));
    expect(job).toContain('$(npx tsx tools/mutation-sets.ts --tests=reality-store-postgres)');
    expect(job).toContain('--no-file-parallelism');
    // The job names no test file of its own: the set's list is the only one.
    expect(job).not.toMatch(/tests\/[a-z-]+\.test\.ts/);
  });
});
