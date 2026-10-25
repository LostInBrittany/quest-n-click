### Fixed

- **A merge on `main` no longer cancels the previous commit's `ci` run (4.5.5, #337)**: `ci` ran in one group per
  ref and cancelled the run in progress, so on `main` a merge right after the release pull request's cancelled the
  release commit's run, the one its tag needs, and `ship tag` re-ran it (10 to 15 minutes on 4.5.4). A push to `main`
  now runs in a group of its own SHA and is never cancelled; on a pull request a newer push still cancels the run it
  supersedes. `qualify` follows the same rule.
