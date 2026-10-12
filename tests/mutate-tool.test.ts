// The mutation tool itself (4.1.20 PR 2a). When the set's tests fail before the first mutant, the run says which test
// failed and why: the 12 October 2026 nightly said only "the tests fail before any mutation", and the cause (shared
// Postgres databases) took a local reproduction to find.
import { describe, expect, it } from 'vitest';
import { failureSummary } from '../tools/mutate';

const VITEST_OUTPUT = `
 RUN  v4.1.5 /repo

 ✓ tests/bridge-backup.test.ts (12 tests) 812ms
 ❯ tests/bridge-leaderboard.test.ts (19 tests | 6 failed) 2311ms
     × the 10 001st run, faster than every other, is first 1269ms
     × orders equal times by submission, then by id 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/bridge-leaderboard.test.ts > the leaderboard, postgres > the 10 001st run, faster than every other, is first
AssertionError: expected [ [ 1, 'late', '1000' ], …(51) ] to deeply equal [ [ 1, 'solo', '4999' ] ]

- Expected
+ Received
 ❯ tests/bridge-leaderboard.test.ts:118:30

 FAIL  tests/bridge-leaderboard.test.ts > the leaderboard, postgres > orders equal times by submission, then by id
error: sorry, too many clients already
 ❯ node_modules/pg-pool/index.js:45:11

 Test Files  1 failed | 1 passed (2)
      Tests  6 failed | 25 passed (31)
`;

describe('a failure before the first mutant', () => {
  it('names each failed test and its first error, then the totals', () => {
    expect(failureSummary(VITEST_OUTPUT)).toEqual([
      'FAIL  tests/bridge-leaderboard.test.ts > the leaderboard, postgres > the 10 001st run, faster than every other, is first',
      "  AssertionError: expected [ [ 1, 'late', '1000' ], …(51) ] to deeply equal [ [ 1, 'solo', '4999' ] ]",
      'FAIL  tests/bridge-leaderboard.test.ts > the leaderboard, postgres > orders equal times by submission, then by id',
      '  error: sorry, too many clients already',
      'Test Files  1 failed | 1 passed (2)',
      'Tests  6 failed | 25 passed (31)',
    ]);
  });

  it('falls back to the last lines when vitest said no FAIL (a crash, a config that does not load)', () => {
    const crash = `${Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')}\nError: Cannot find module 'pg'`;
    const got = failureSummary(crash);
    expect(got.length).toBeLessThanOrEqual(20);
    expect(got.at(-1)).toBe("Error: Cannot find module 'pg'");
  });

  it('keeps a long run short: at most ten failures are named', () => {
    const many = Array.from({ length: 30 }, (_, i) => ` FAIL  tests/a.test.ts > case ${i}\nError: boom ${i}`).join(
      '\n',
    );
    const got = failureSummary(many);
    expect(got.filter((l) => l.startsWith('FAIL')).length).toBe(10);
    expect(got.at(-1)).toBe('… and 20 more failed tests');
  });
});
