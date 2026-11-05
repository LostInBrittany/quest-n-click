### Changes

- **The coverage ratchet is strict on pull requests, warns in the candidate, and writes its fix (4.7.0, #410)**:
  `coverage-ratchet --strict` ran only off pull requests, so a pull request that lifted the coverage merged green and
  main turned red after it (#425's routes tests, three floors), or the candidate stopped on it (#411). Now the
  `coverage` job is strict on every pull request as on main, `release-check:ci` only warns (a floor too low is no defect
  of a release), and `npx tsx tools/coverage-ratchet.ts --write` raises each floor it names to two points under the
  measure, rounded down, in `tests/coverage-floors.json`. The floors follow #425: `route-runtime.ts` and `world.ts`
  branches 95 and 96, total functions 72 and statements 75.
