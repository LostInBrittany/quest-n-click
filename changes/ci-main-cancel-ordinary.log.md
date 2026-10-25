## main's ci: only the release commit is never cancelled

#338 (#337) put every push of `main` in a group of its own SHA, never cancelled, so that the release commit's run
survives the next merge. On 25 Oct the merges of #334, #336, #338 and #341 each kept a full run, the runners went to
`main`, and #344's CI could not start until two superseded runs (40236252581, 40236266866) were cancelled by hand.
Only the release commit's run is read (`release.yml`'s main-ci gate on the tag's SHA, D55), so only it needs the
group of its own: `ci-${{ <release> && github.sha || github.ref }}` plus `-by-hand` for `workflow_dispatch`, and
`cancel-in-progress` on a pull request or a push that is not a release. `<release>` is
`contains(github.event.head_commit.message, '/release/')` (the merge of `release/<x.y.z>`, as 4.5.3 and 4.5.4 were
merged) or `… '(prepared by npm run release -- prepare)'` (`preparedSubject`: the repository's squash message lists the
commits, a rebase keeps it when it is the last one). Rulings: a loose `': the release'` was refused (it matches "release:
the release commit is looked for…"); a false positive only spares a run its cancellation, a false negative is #337
again; a rebase of a release pull request with commits after the prepared one never had a `ci` run on the release
commit (ci runs on a push's head only), cancelled or not. `qualify` goes back to one group per ref, cancelled except by
hand: the release reads the candidate's qualification, never `qualify`'s `main` run. The test's evaluator learnt
`contains()` and `!`; it pins two ordinary pushes (one group, the newer cancels), a release merge, squash and rebase
(own group, never cancelled, apart from ordinary pushes and runs by hand), pull requests (cancel) and a run by hand
(cancels nothing). actionlint 1.7.7 clean. The CI page (en, fr) says it.

→ next: 4.5.5's release, the first whose release commit's run is the only one on `main` kept from cancellation.
