## A release in three commands: the plan, and the mechanical fixes

#410 and its comment list what 4.6.0's release cost: 18 `TODO(release)`, 11 claim reviews typed that day, the upgrade
notes' section doubled, the Studio Server's lock left at the peer `4.5.x` (797ba349 by hand), the candidate red on the
strict coverage ratchet (#411, #412), a fetch and a tag push failing once during GitHub's incident, a release run with
no job told to re-run `--failed`, and the checkout left on `release/4.6.0`. `docs/dev/PLAN-4.6.x-RELEASE-IN-THREE-COMMANDS.md`
orders the pull requests that remove them, smallest first.

This branch is its first pull request: six commits, each with its failing test first. `lib.mjs`'s `retried` and
`gitRetried` (four tries, 15 s, on the release clock); `rerunArgs`/`rerunCommand` (`--failed` only when a job failed,
was cancelled or timed out); the red candidate's stop naming `--commit … --start-candidate`; `releaseRefusals` with the
organisation's remote, one line for the switch and the pull (prepare stays on its branch, where review fixes go);
`lockWithPeers` in `pack-manifests.mjs` and `prepare`'s `locks` step; `withUpgradeNotes` (4.6.0's pages before e4df77a3
as fixtures, `tests/fixtures/release-4.6.0/`).

Planned, not done here: the coverage ratchet (strict on pull requests and main, a warning in the candidate,
`--write`), which changes `ci.yml` and a gate; the flaky `reality-cursor` test and the release page; fewer CI round
trips; claims reviewed in their pull request and `prepare` writing the prose, both the maintainer's decision.

→ next: the maintainer picks the options of PR 5 and PR 6, and decides PR 2's ratchet design.
