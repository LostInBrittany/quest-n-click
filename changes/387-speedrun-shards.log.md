## The mutation runs lost vitest's failed-first order; `speedrun` in two shards

#387: `mutation (speedrun-1of1)` hit its 120-minute timeout in the 4.5.6 warm-up (run 40422427281). No speedrun test
changed after 23 October. The cause is #349 (25 Oct 23:13): `vite.config.ts` got `sequence.sequencer:
DurationSequencer` for ci.yml's unit shards, and `vitest.mutation.config.ts` spreads `base.test`, so every mutant's
`vitest run --bail 1` took it too. vitest's `BaseSequencer` sorts the files that failed the previous run first (its
results cache), and `tools/mutate.ts` mutates a file in source order: the file that killed one mutant kills the next
before the others start. `DurationSequencer.sort` ignores the cache and starts `speedrun-daily` and the other long
files first. Measured on 20 consecutive mutants of verify.ts, interleaved one by one, three workers: 132 s with the
duration sequencer, 30 s with vitest's, the same verdicts. Every set slowed between the 4.5.4 candidate (25 Oct 19:06)
and the warm-up: `speedrun` 38 → >120 min, `remix` 42 → 114, `connectors-pure` 46 → 96, `reality-2of2` 23 → 70,
`connectors-edge-1of4` 10 → 50. `vitest.mutation.config.ts` now sets `sequencer: BaseSequencer`
(`tests/unit-shards.test.ts` pins it). `SHARDS.speedrun = 2`: `verify.ts` alone (398 of 539 mutants), envelope and
recorder in the other (`tests/mutate-shards.test.ts`). Expected: about 30 min for verify.ts and 10–15 min for the
other shard, from the 38 minutes the whole set took before #349.

→ next: if verify.ts alone ever nears the limit, the cut would need files below one file (a shard by mutant range in
`tools/mutate.ts`), not a longer timeout.
