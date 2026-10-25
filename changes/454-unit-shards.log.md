## The unit suite in four shards (part A2 of "Simple release")

Part A (#305) kept the unit suite on every pull request (`check` runs none), ~9 min without coverage, ~13 with. The
`unit` matrix now runs it in four shards at once, from `test:coverage`'s set of files; `coverage` needs it, merges the
blob reports under coverage (`vitest --merge-reports --coverage`) and runs the ratchet. A shard applies no floor
(`VITEST_SHARD`): a quarter of the suite measured 41–46 % of lines against a floor of 75 %, so the floors apply to the
merge only. Locally the four shards took 20–52 s each and the merge 2 s, the summary the ratchet reads where it was.
Plan: docs/dev/plans/4.5.4-a2-unit-shards.md.

→ next: this PR's own run gives the shards' time on a runner; then part B (the release PR made by one command).
