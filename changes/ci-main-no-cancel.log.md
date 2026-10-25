## every main commit keeps its own ci run

4.5.4's release: `ship tag` found `ci` run 40224466313 on `47dccf1` (the merge of #322) cancelled by the push of
#324's merge and re-ran it ("ci cancelled: re-running the failed jobs of run 40224466313 once"), 10 to 15 minutes.
`ci.yml` ran in `ci-${{ github.ref }}` with `cancel-in-progress` on for everything but a run by hand (#337). A push now
runs in `ci-<sha>` and only a pull request cancels (`cancel-in-progress: github.event_name == 'pull_request'`): with
`cancel-in-progress: false` alone, one group per ref would still lose a pending run when a third merge comes, which
GitHub cancels in any group. A run by hand keeps its group per ref and waits. `qualify.yml` had the same pattern on its
`main` runs (`cancel-in-progress: true`, one group per ref): no release step reads them, but they keep the profile from
rotting between candidates, so they follow the same rule, `qualify-<pr number or sha>`. `candidate` (per SHA),
`release` (per tag) and `docs-publish` (one group) never cancel; `nightly`, `prove` and `mutation` set no concurrency
and run on no push. A test in `tests/release-main-ci.test.ts` reads each workflow's `concurrency:` and evaluates its
two expressions for a push of `main`, a pull request and a run by hand. `tests/release-docs-publish.test.ts`, which pinned the
old `cancel-in-progress` text, pins the new one. The CI page (en, fr) says which run a newer
push cancels. actionlint is not installed here: the two files were checked as YAML only.

→ next: 4.5.5's release, whose release commit keeps its run.
