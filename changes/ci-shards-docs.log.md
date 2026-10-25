## the unit shards by duration, the CI page brought up to date

Over the last 20 runs of ci.yml (25 October 2026) the fourth `unit` shard ran its tests in 70–97 s, the three others
in 105–273 s. Vitest's `BaseSequencer.shard` sorts the files by the SHA-1 of their path and cuts the list into equal
counts: in run 40237204928 the files' own durations summed to 450 / 410 / 292 / 195 s over 92–93 files each, with the
three files of about two minutes (`checkpoint`, `compact`, `por`) and those of 70–80 s (`wiki-archive`,
`studio-engine-upgrade`, `status`) all in shards 1–3. Options weighed: moving the heavy files by hand (rots with every
new test), vitest's cache (empty on a fresh runner), a duration-aware sequencer from a committed table (chosen).
`tools/unit-shards.ts` replaces `shard()` and `sort()`, with vitest's types only (the module ships in the package
beside `vite.config.ts`, and vitest is a development dependency). A first version balanced the summed durations
(longest-processing-time greedy): on this pull request's first run, under coverage, the test steps took 257 / 226 /
129 / 143 s. The sums were even, but `checkpoint` (205 s) and `compact` (194 s) set their shards' floor, and with no
cache vitest starts the largest file first, not the longest: `checkpoint` began 49 s in. The second version counts a
shard's time as max(longest file, total / 2): a runner works on about 2.5 files at once (summed file time over wall
time in these runs), and 2 leaves room for the imports and keeps the files spread (at 2.2 a third of the suite piled
under `checkpoint`'s shard). Each file goes to the shard it leaves the shortest, ties to the least work; `sort()`
starts the longest recorded file first. Replayed on that run's own file times, the slowest shard drops from 256 s
to about 211 s of tests; the floor is the longest file. The table is the median of four
runs' logs (40237204928, 40236266866, 40236988562, 40231754186; one under coverage); the four shards get 109 / 90 /
87 / 86 files and 199 s each in the model. `tests/unit-shards.test.ts` covers the split, the recording, the
wiring, and that the committed table keeps the four within a tenth of each other's time, with no shard holding twice
another's files.

The plan rule: rules are first-match, and `^(tools|scripts)\/` came before the hosted-Studio rule that named
`tools/studio/diff-rooms.ts`, which `studio-server/src/ops/diff-captures.ts` imports and only `studio-hosted` tests.
A rule of its own before the generic one (authoring gates and `studioHosted`); a check over `git ls-files` finds no
other rule a specific path of which is shadowed. The CI page (en, fr): the workflows table (`ci` on no tag,
`release` on the tag's push, the candidate on the release merge, the nightly's warm-up by `prepare`), the ratchet on
a tag gone, the third tier, `full-ci`'s "on a tag", a `unit (<i>)` row to reproduce a shard, and a section on the
shards. #347 (main's non-release pushes cancelled again) is still open and is not described.

The second version's run (40242277080, under coverage): tests 119 / 215 / 96 / 201 s against 257 / 226 / 129 /
143 s before it and 241 / 262 / 268 / 95 s on main. Every long file now starts within 4 s of its shard. What is
left is each file's own variation: `wiki-archive` took 159 s (79–138 s in the five other runs), `status` 110 s
(38–80 s), `por` 92 s (72–186 s), `checkpoint` 117 s (117–214 s). The table is now the median of six runs, these
two among them. Replayed on each of the six runs' real file times, the slowest shard is that run's longest file plus
0 to 36 s; a split made before the run cannot do better while the files vary by half. Splitting `checkpoint` and
`compact` into smaller files would lower the floor; it is not done here. The page's plan table also gets #353's
`scripts/ci-playwright-deps.sh` row, merged meanwhile.

→ next: refresh `tools/unit-durations.json` when a shard drifts past a fifth of the others.
