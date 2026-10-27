## The candidate's heavy suite once, in three shards; the three measuring runs in the nightly

#392: on 4.5.5's candidate (run 40324821053) the three `heavy` attempts took 44.4, 44.1 and 20.2 minutes, every other
non-mutation job ended within 17. Attempts 2 and 3 proved nothing more (the counters and the oracle are deterministic),
they measured. Per file, the median of the three reports: audit 837 s, partition 409, solver-oracle 339, dominance 306,
checkpoint-matrix 303, reference-proof 136, ownership 106, canonical 96, memo 79 (2611 s in all). `tools/heavy-shards.ts`
reads `test:heavy`'s list from package.json and cuts it with unit-shards' `assignShards`, which takes a `parallel`
argument now (1 here: `--no-file-parallelism`, a shard's time is its sum). The cut: audit alone (837 s); partition,
checkpoint-matrix, ownership, memo (897 s); solver-oracle, dominance, reference-proof, canonical (877 s). The job takes
its files on a line of their own under `bash -e`, so a failed tool never leaves a `vitest run` with no filter. The
nightly's `heavy` is the three-attempt matrix now (it ran once), with each file's seconds in the step summary and the
JSON reports kept, from which `--record` refreshes the table. `baseline.mjs` reads `heavy-shard-<n>`; the gate's
summary and missing list too.

→ next: refresh `tools/heavy-durations.json` from a nightly's three reports if a shard drifts past the others; audit
alone is the floor (14 minutes on the slow runners), a further cut would split inside that file.
