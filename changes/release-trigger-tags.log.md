## release.yml starts only for v* tags

Every `ci` run (main, each pull request) fired `release.yml`, whose jobs all skipped unless the run was a tag's: the
Actions list filled with skipped release runs. `workflow_run` takes a `branches:` filter, matched against the triggering
run's `head_branch`, which is the tag's name for a tag push; `branches: ['v*']` keeps only those. The jobs' `if:` (a
successful push of a SemVer-looking ref) stay as they were, the gate. Merged after 4.5.2's release run had started,
since `workflow_run` reads the workflow from main.

→ next: the next rc tag shows the filter lets a tag's run through; if it does not, revert the three lines.
