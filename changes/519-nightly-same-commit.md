### Changes

- **The nightly skips a night on a commit it already tested (next, #519)**: a scheduled run whose commit is the one the
  last completed scheduled run tested (green or red, not cancelled) skips every job and stays green, and its summary
  says "same commit as run <id> (<conclusion>): nothing to re-test". From 27 October to 8 November 2026, 7 of the 13
  nights did that (0da4745 five nights in a row, red each time, #395 commented each time), about 750 runner-minutes
  each. The report is skipped with it, so an open `nightly-red` issue stays open and gets no new comment. The `guard`
  job reads the previous runs with `actions: read`; when it cannot, the night runs. A run by hand always runs:
  `gh workflow run nightly --ref main`.
