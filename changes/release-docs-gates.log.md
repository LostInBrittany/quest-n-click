## the release command checks the docs' human gates on the release commit

4.5.4's `docs-publish` (release run 40234535060) refused `create.review-pages`: the claim `import-layout-merges` (#318)
was self-checked by its AI author, not reviewed. #318 reached `main` after the release pull request's (#322) CI had
run `release -- check` on its branch, and before the merge; nothing checked the gates on `47dccf1` itself (#339).
`runRelease` now runs `humanGates` (prepare's, the release pull request's check) in `gatesAt(sha)`, a temporary
detached worktree of the release commit with the checkout's `node_modules` linked, removed in a `finally`: `main` can
be ahead of the release commit, and `wiki -- check --publish` judges the checkout it runs in (`--doc-ref` must be its
HEAD). It runs after the other refusals and before the candidate is waited for, and not once the tag is out (a
resumed run). Run on `47dccf1`, it gives 4.5.4's refusal in seconds. The tag is pinned to the release commit, whose
tree cannot take a review, so `docsGatesStop` names the one way on, `--docs-revision`: the release and npm as usual,
then a revision from `docs/<v>` (`docsRevisionSteps`: the branch cut from the tag, the reviews, the push,
`gh workflow run docs-publish -f mode=revision`), printed again in the summary. Not taken: "require branches to be up
to date" on `main` (every pull request would re-run its CI whenever `main` moves, for a release-only trap), and a
candidate that fails on the gates (a red candidate on the release commit could never turn green without a new
version; it keeps its docs check as a warning). The releasing page (en, fr) says it.

→ next: 4.5.4's docs revision for `import-layout-merges`; 4.5.5's release, the first to check its gates on its commit.
