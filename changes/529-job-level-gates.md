### Changes

- **A job the plan spares is skipped, not run to say "not needed" (next, #529)**: the ruleset on `main` requires
  `pr-gate` alone, so the sixteen gated jobs of `ci.yml` read their gate in a job-level `if:`, as `external-consumer`
  already did. A pull request's checks now list a spared job as skipped instead of green with a "not needed by the
  plan" step: no runner is asked for, no Playwright image pulled. The 157 per-step `env.RUN` conditions, the sixteen
  notice steps and the images chosen by the plan are gone. `pr-gate` accepts a gated job's skip only when its gate is
  false; a skip with the gate true, a failure or a cancellation stays red, and `pwa-firefox` stays a warning when it
  ran (#257). `unit` and `coverage` are unchanged: their gate chooses coverage or not, it never skips the suite.
