## the human gates before prepare pushes

4.5.4's release pull request failed its `check` job on four claims only an AI had checked: the maintainer recorded
each review by hand, pushed, and waited for CI a second time. `prepare` now runs those gates (`humanGates`, shared
with `checkRelease`) after its commit and before the push; a red gate prints the wiki's ✖ lines and the same command
to run again (`gatesStop`) and exits 1. Run again on `release/<version>`, `resumeRefusals` recognises the branch it
prepared (package.json at the version, `preparedSubject` among the commits over main, a clean tree) and runs
`RESUME_STEPS` only: the gates, then the pull request. Any other state of that branch is refused. The tool never
writes a human review, not even behind a prompt: the person types `review-claim`. The releasing page (en, fr) says so,
and that `npm run release -- check` on main lists the pending claims early.

→ next: use it on 4.5.5's release, which should run the pull request's CI once.
