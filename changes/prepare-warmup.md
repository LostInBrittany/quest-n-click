### Changes

- **`prepare` starts the mutation cache's warm-up when it pushes (4.5.5, #331)**: once the release pull request is
  pushed, `npm run release -- prepare` runs `gh workflow run nightly --repo <the organisation's repository> --ref main
  -f jobs=mutation` (#330) and prints the run's link; the pull request's body says it too. The release commit moves
  only version fields, outside the mutation input hashes, so the cache filled while the pull request is in review is
  the one the candidate its merge starts reads: nobody has to remember the warm-up. A dispatch refused is a warning with
  that command to run by hand, never a failure; a stop before the push starts nothing; `--no-pr` starts nothing and
  prints the command.
