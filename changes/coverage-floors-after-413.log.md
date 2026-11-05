## the coverage ratchet strict on pull requests, a warning in the candidate, and `--write`

main's `coverage` job turned red after #432's merge: #425 read the routes set's survivors and its tests lifted
`route-runtime.ts` and `world.ts` branches to 97.35 and 98.00, for floors of 87 and 86, and total functions to 74.00
for 71. `coverage-ratchet --strict` ran only off pull requests, so #425 merged green; the day before, the same check
stopped the 4.6.0 candidate (#411). PR 2 of `docs/dev/PLAN-4.6.x-RELEASE-IN-THREE-COMMANDS.md` (#410), done: the
ratchet's logic moves into `tools/coverage-floors.ts` (`ratchetSlack`, `raiseFloors`, tested on their own), `ci.yml`'s
`coverage` runs it `--strict` on pull requests too, `release-check:ci` without `--strict`, and `--write` raises each
floor it names to two points under the measure, rounded down. On main's old floors and a local measure, `--write`
gives exactly the four floors raised by hand in this pull request (statements was the next to trip: 77.06 for 74).
`contribute.coverage-ratchet` (en, fr) says where it is strict and the one command.

→ next: nothing; a pull request that lifts the coverage now raises its own floors.
