### Changes

- **`prepare` stops before the push on `TODO(release)` prose too (4.5.5)**: the stop before the push now covers the
  `TODO(release)` markers left in the release's files (the same ones `npm run release -- check` counts) as well as the
  docs' human gates, in one stop: each marker with its file, line and brief, each review with its command, nothing
  pushed. Write the prose yourself or ask your AI assistant to, with those markers as the brief, read the diff, record
  the reviews, commit on `release/<version>` and run the same `prepare` again: it pushes and opens the pull request
  only when nothing is left, so its CI runs once. The tool still writes no prose, records no review and calls no AI.
