## the unit shards by duration, the CI page brought up to date

Over the last 20 runs of ci.yml (25 October 2026) the fourth `unit` shard ran its tests in 70–97 s, the three others
in 105–273 s. Vitest's `BaseSequencer.shard` sorts the files by the SHA-1 of their path and cuts the list into equal
counts: in run 40237204928 the files' own durations summed to 450 / 410 / 292 / 195 s over 92–93 files each, with the
three files of about two minutes (`checkpoint`, `compact`, `por`) and those of 70–80 s (`wiki-archive`,
`studio-engine-upgrade`, `status`) all in shards 1–3. Options weighed: moving the heavy files by hand (rots with every
new test), vitest's cache (empty on a fresh runner), a duration-aware sequencer from a committed table (chosen).
`tools/unit-shards.ts` overrides `shard()` only (longest-processing-time greedy, ties by path, so every shard computes
the same split from the same files) and delegates `sort()` to vitest's `BaseSequencer`, loaded lazily: the module
ships in the package beside `vite.config.ts`, and vitest is a development dependency. The table is the median of four
runs' logs (40237204928, 40236266866, 40236988562, 40231754186; one under coverage); locally, the four shards now get
93/93/93/94 files and 399 s of recorded time each. `tests/unit-shards.test.ts` covers the split, the recording, the
wiring and that the committed table keeps the four within a fifth of each other.

The plan rule: rules are first-match, and `^(tools|scripts)\/` came before the hosted-Studio rule that named
`tools/studio/diff-rooms.ts`, which `studio-server/src/ops/diff-captures.ts` imports and only `studio-hosted` tests.
A rule of its own before the generic one (authoring gates and `studioHosted`); a check over `git ls-files` finds no
other rule a specific path of which is shadowed. The CI page (en, fr): the workflows table (`ci` on no tag,
`release` on the tag's push, the candidate on the release merge, the nightly's warm-up by `prepare`), the ratchet on
a tag gone, the third tier, `full-ci`'s "on a tag", a `unit (<i>)` row to reproduce a shard, and a section on the
shards. #347 (main's non-release pushes cancelled again) is still open and is not described.

→ next: refresh `tools/unit-durations.json` when a shard drifts past a fifth of the others.
