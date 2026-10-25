## changes --check reads the fragments as --assemble will

#328's `changes/release-first-parent.md` opened on `### Fixes`: CI's `check` job ran `changes -- --check`, which only
looks for a fragment (`needsFragment`), the pull request merged, and the heading would have stopped 4.5.5's `prepare`
at `--assemble` (#335; found while fixing #333). `fragmentProblems` lists, as `changes/<name>:<line>: …`, what
`--assemble` refuses in every file of `changes/` (the branch's and the others, since all are folded at the release):
a heading outside `SECTIONS`, text before the first heading (once, at its first line), a `.log.md` not opening on
`## <title>`. `sectionsOf` and `logEntryOf` throw the first problem of the same `sectionProblems` and `logProblem`,
so the check and the assembly cannot disagree. `--check` says them all and exits 1 before the fragment question. CI
needed no change: the `check` job runs `changes -- --check` on every pull request. This branch carries #334's
one-line `### Fixed` in `release-first-parent.md` too (the same change, so either order merges), or its own CI would
fail on main's fragment. A test runs the check on the branch's own `changes/`. The conventions page (en, fr) listed
the refusal under `--check` already; it now says what the check reads and shows its message.

→ next: 4.5.5's release.
