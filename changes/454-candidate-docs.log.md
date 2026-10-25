## The candidate starts itself, the docs publish themselves (parts C and E of "Simple release")

4.5.3 asked the maintainer to start the candidate by hand after the release PR's merge, then to approve docs-publish,
whose human gates (a claim's review reset by a test file) were only checked after the tag. `candidate.yml` gains a
`push: [main], paths: [package.json]` trigger and a `release-merge` job that reads both versions (a dependency bump
starts nothing); `candidateRunProblem` and release.yml accept `push` on `main` beside `workflow_dispatch`; the three
steps that held to `workflow_dispatch` (the deployment profile, the full qualification, the manifest's attestation)
now hold to anything but a pull request. `wiki -- check --publish --reviews-only` keeps every gate but "executed" and
needs no candidate run; `release -- check` runs it, and ci.yml runs `release -- check` on a `release/*` branch. The
candidate's `release-core` checks its docs against its own report as a warning. docs-publish picks its environment
by its call: `docs-publish` (release, no reviewer, `v*`) or `docs-publish-manual` (reviewers, `main`, `docs/*`).
Plan: docs/dev/plans/4.5.4-ce-candidate-docs.md.

→ next: the maintainer applies the two environments' settings; then part D (`npm run release -- <version>`).
