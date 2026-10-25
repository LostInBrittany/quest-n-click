### Changes

- **A docs, tooling or release pull request waits less for its CI** (4.5.4, #302): the unit suite runs under coverage only when product code changes (the plan's new `coverage` gate), `windows` and `node-24` no longer run for the release and wiki tools nor for tests alone, `pwa-firefox` warns instead of failing `pr-gate` until #257 is fixed, and the candidate runs its mutation sets 8 at a time so pull requests are not queued behind it. `main`, a tag and `full-ci` still run everything.
