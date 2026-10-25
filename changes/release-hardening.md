### Fixed

- **`npm run release -- <version>` starts again (4.5.5, #348)**: since #339 the release command imported the docs'
  gates from `tools/release/prepare.ts`, whose dispatch awaits the release command at its top level; the cycle never
  settled, and the command exited at once with "Detected unsettled top-level await". The gates have their own module
  (`tools/release/gates.ts`).
- **The release command's candidate wait (4.5.5, #348)**: it re-ran a failed candidate once per process, so a relaunch
  re-ran it a second time; the run's attempt number now says it was re-run (by the command or by hand), and the same
  holds for `ship`'s re-run of main's `ci`. A candidate cancelled before any job failed is re-run whole, and said so,
  never with an empty list. An attempt still going after 3 hours stops the command with the run's link and how to
  resume, instead of waiting forever.
- **`npm run release -- prepare` and `check` (4.5.5, #348)**: `check` fails without the passes sheet
  (`docs/dev/passes/<version>.md`) or the golden save (its entry in `tests/fixtures/saves/index.json`, its file).
  `prepare` refuses a release name its files cannot hold (one with `( ) [ ] " « » \` \ $ < > |`, which broke the
  README's release link), and a newest passes sheet without its `<!-- field:begin -->` marker (it was cut at the wrong
  place). The CHANGELOG's intro calls an `x.0.0` a major release, and says `LOG #N` when there is one LOG entry.

### Changes

- **An end-to-end test of the release command (4.5.5, #348)**: `tests/release-command.test.ts` runs
  `npm run release -- <version>` through its CLI dispatch on a scratch repository shaped like 4.5.4's history, against
  fake `gh`, `npm` and `ship`, its waits on a virtual clock (`QNC_RELEASE_CLOCK=virtual`): the merge found as the
  release commit, a candidate failed or cancelled then re-run, a relaunch after the tag, a failing docs-publish, an
  empty or partial `npm stage list`, main's `ci` cancelled then re-run.
