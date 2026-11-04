## `external-consumer` skipped at the job level when the plan spares it

On 4 November GitHub's Actions were degraded and no macOS runner came: `external-consumer (macos-15)` waited 15
minutes and was cancelled, twice on #423 and once on #425, and `pr-gate` failed with it. Neither pull request touched
a package: the job had nothing to do and would only have printed "not needed by the plan". Every spared job still runs
and says so in a step, because the ruleset once required each job by name; since 4.5.4 it requires `pr-gate` alone.
`external-consumer` now has a job-level `if` on the plan's `freshInstall`, so no runner is asked for, and `pr-gate`
accepts its `skipped` exactly when the plan spares it (`EXTERNAL`); any other result still fails the gate. The other
spared jobs keep their step: all on Ubuntu runners, plentiful, but `windows`, one runner and not this afternoon's
shortage.

→ next: the other spared jobs could follow the same way if Ubuntu runners ever queue.
