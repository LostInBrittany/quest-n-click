### Fixed

- **Only a release commit keeps its own `ci` run on `main`; a burst of merges no longer starves the pull requests
  (4.5.5, #345)**: since #337 every push of `main` ran in a group of its own SHA, never cancelled, and four merges in
  a row queued four full runs that took the runners from the pull requests. Now a push of `main` whose head commit is a
  release commit (the merge of `release/<x.y.z>`, or the subject `prepare` writes, which a squash lists and a rebase
  keeps) still runs in a group of its own SHA and is never cancelled; every other push of `main` shares one group and
  cancels the run it supersedes, as before #337. A `ci` run started by hand has a group of its own and cancels
  nothing. `qualify` cancels on `main` again: no release step reads its `main` run.
