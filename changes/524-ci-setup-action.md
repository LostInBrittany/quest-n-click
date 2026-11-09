### Changes

- **The CI installs Node and the dependencies through one local action (next, #524)**: 46 jobs of `ci.yml`,
  `candidate.yml`, `nightly.yml`, `release.yml`, `qualify.yml`, `docs-publish.yml`, `mutation.yml` and `prove.yml`
  each pasted the same setup-node block and `npm ci` retry loop. They now call `.github/actions/setup`, which runs
  setup-node with the npm cache, then `npm ci` three times, 15 s apart, each attempt bounded on Linux by its `timeout`
  input (minutes, 6 by default, 0 for none) and unbounded on macOS and Windows as before; `safe-directory: true` tells
  git the checkout is safe in the Playwright container jobs. Every job keeps its own per-attempt and step limits.
  `tests/ci-retry.test.ts` checks the action's loop, runs its script against stand-ins, and fails when a job runs
  `npm ci` without it; a change to `.github/actions/` runs every CI job. The mutation jobs keep their loop for now.
