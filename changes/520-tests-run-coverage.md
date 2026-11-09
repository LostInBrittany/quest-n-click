### Fixed

- **A pull request that changes tests runs the unit suite under coverage (next, #520)**: the CI plan left the
  `coverage` gate off for every file under `tests/`, so the strict ratchet never saw a test that lifted a file above
  its floor, and `main` failed in `coverage` after the merge (six runs between 30 October and 5 November, after #425:
  "route-runtime.ts branches: floor 87, measured 97.35"). The tests now open `coverage`, the hosted Studio's and the
  wiki's tests too, beside their own gates; the pull request raises its floors (`npx tsx tools/coverage-ratchet.ts
  --write`) before it merges. The unit shards ran on every change already: what is added is the instrumentation and
  the merge, within the shards' usual spread.
