## prepare starts the mutation warm-up when it pushes

#330 made the nightly's mutation jobs fill the cache the candidate reads, and a warm-up on demand (`-f jobs=mutation`)
for the day an input every set reads moved; the releasing page asked the maintainer to start it after the last merge.
`prepare` now does it in its `pull request` step, after the push and before `gh pr create`, so the body can say it:
`warmupArgs`/`warmupCommand` (the nightly, `--repo REPO`, `--ref main`, `-f jobs=mutation`), `startWarmup(run, repo)`
(through the same `capture` runner as the human gates; never throws: a non-zero exit or a missing `gh` is a ⚠ with the
last line gh printed and the command to run by hand; the run's URL when gh prints one, else the workflow's page),
`warmupBodyLine` and `noPrNote`. Rulings: the dispatch needs the push (main's hashes equal the release commit's, the
branch does not matter, but a prepare that stopped or a dry run touches nothing remote); on a resume it starts with
the push of that run; `--no-pr` pushes nothing and so starts nothing, and prints the command for when the pull request
is opened by hand; a fork's maintainer (`WEB_SCUMM_REPO`) warms their own repository's main. Six tests, a fake runner,
no dispatch for real; one pins the call's place in the step (after the push, before the pull request, never in the
stop). The releasing page (en, fr) says it; the manual command stays for a candidate on another SHA.

→ next: 4.5.5's release, the first whose candidate finds the cache warm without anyone starting it.
