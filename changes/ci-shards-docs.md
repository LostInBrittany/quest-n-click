### Fixed

- **The four unit shards take about the same time (4.5.5, #349)**: vitest's `--shard` gave each shard as many files,
  in the order of a hash of their paths, and 4.5.4's shard 4 ran its tests in about 85 s when the others took 150 to
  270 s. The sequencer of `vite.config.ts` (`tools/unit-shards.ts`) now splits by each file's duration, recorded in
  `tools/unit-durations.json`: a shard's time counts as the larger of its longest file and its total over two, each
  file goes to the shard it leaves the shortest, the longest file of a shard starts first, and a file the table does
  not know counts as the median. `npx tsx tools/unit-shards.ts --record <vitest json report>` refreshes the table.
- **A change to `tools/studio/diff-rooms.ts` runs `studio-hosted` (#349)**: the CI plan's hosted-Studio rule named it,
  but the generic `tools/` rule came first and took it; it has its own rule now, before that one.

### Changes

- **The CI page says what the workflows do since 4.5.3 (#349)**: a tag runs no `ci`; `release` starts on the tag's
  push and tests nothing again; the candidate starts on the release pull request's merge and is the release's only
  test pass; `release -- prepare` warms the nightly's mutation cache; the shards by duration. Two comments of
  `ci.yml` and `pr-gate`'s line for a skipped mutation job said otherwise.
