### Fixed

- **`npm run release -- <version>` checks the docs' human gates on the release commit before the tag (4.5.5, #339)**:
  the release pull request's CI checked them on its own branch, so a claim merged to `main` before the release pull
  request (4.5.4's `import-layout-merges`, #318) was only found by `docs-publish`, an hour after the tag. The preflight
  now runs the same check on the release commit's own tree (a temporary worktree of it) and stops before anything is
  waited for, with each pending item and its command. That commit can no longer take a review, so the stop gives the
  way on: `--docs-revision` releases as usual, npm included, and prints the steps of the docs revision to publish after.
