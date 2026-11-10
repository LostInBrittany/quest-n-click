### Changes

- **A red night says how to re-run it by hand (next, #538)**: since #519 the following scheduled nights on the same
  commit are skipped, so a night red for an outside reason (a network error, a runner problem) stays red until a new
  commit lands. The `nightly-red` issue's text for a red scheduled night, and the guard's summary of a night skipped
  after a red one, now say so in the same words, with the command: `gh workflow run nightly --ref main`.
