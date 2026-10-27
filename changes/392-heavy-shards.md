### Changes

- **The candidate runs the heavy solver suite once, in three shards (4.5.7, #392)**: its `heavy` job ran the whole
  suite three times, each on a new runner, to measure its duration – up to 44 minutes each, the candidate's critical
  path. The suite's verdicts are deterministic, so one run is the proof: `test:heavy`'s nine files are now cut in three
  shards by their recorded durations (`tools/heavy-shards.ts`, `tools/heavy-durations.json`), one runner each, one
  file after the other, about 15 minutes a shard. `tests/heavy-shards.test.ts` pins that the shards cover
  `test:heavy`'s list with no file missing or doubled. The three duration measurements move to the nightly, whose
  `heavy` job now runs the whole suite three times and keeps each report (`heavy-1` to `heavy-3`). The candidate's
  reports are `heavy-shard-1` to `heavy-shard-3`, and its baseline lists the heavy suite by shard.
