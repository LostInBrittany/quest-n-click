## npm run release -- <version> (part D of "Simple release", D57)

The last part of the plan: after the release pull request's merge, `tools/release/release-run.ts` (routed from
`npm run release -- <x.y.z>` by prepare.ts) refuses first (`releaseRefusals`), names the newest candidate of the
commit started on main (`pickCandidate`: the merge's push run, or one by hand; `--start-candidate` dispatches one),
waits saying `candidateProgress` every minute and re-runs failed jobs once, runs `ship tag … --sign` (which waits for
main's ci, pushes the signed tag to the organisation's repository, follows release.yml and verifies), then reads
`npm stage list` (`stagedFor`, the engine first) and runs `npm stage approve` for each with the maintainer's 2FA. D57
records the three human actions. A dry run on a feature branch refused for the four right reasons.

→ next: release 4.5.4 itself with the new commands, the first real run of parts B to E.
