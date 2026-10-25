### Fixed

- **`npm run release -- <version>` finds the candidate of a merged release pull request (4.5.5)**: it looked for the
  release commit down every line of `package.json`'s history, the merged `release/<version>` branch included, so it
  named the `prepare` commit instead of the merge the candidate ran on and stopped with "no candidate of … on main".
  It now follows main's first parents only.
