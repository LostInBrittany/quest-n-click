### Changes

- **`prepare` checks the docs' human gates before it pushes (4.5.5)**: `npm run release -- prepare` runs
  `wiki -- check --publish --reviews-only`, the check the release pull request's CI fails on, after its commit. A claim
  or a pair still to review stops it there, nothing pushed and no pull request, each printed with its command for a
  person to type (the tool never records a review); run the same command again once they are committed and it resumes
  at the gates on `release/<version>`, then pushes and opens the pull request, so its CI runs once. On `main`,
  `npm run release -- check <version>` lists them earlier.
