## candidate starts only when full-ci is added

Over two days, 28 of about 200 workflow runs were `candidate` on a pull request push, every job skipped (no `full-ci`
label). `candidate.yml` now listens to `pull_request: [labeled]` only, and its `target` job runs when the label added is
`full-ci` (`github.event.label.name`), so another label added to a labelled pull request starts nothing either. With
#292, the skipped `release` runs (64 in two days) are already gone. `ci`'s own reading of `full-ci` is unchanged.

→ next: none.
