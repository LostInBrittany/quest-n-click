## the release command, end to end

4.5.4's `npm run release -- 4.5.4` ran end to end for the first time on the release itself, and each of its bugs was
found there: the wrong release commit (#328), the docs gates late (#341), a second `ship verify` on a relaunch (#344).
#348 adds the test that runs it before a release does. `tests/release-command.test.ts` builds a scratch repository
(4.5.4's shape: the release branch's prepare, prose and review commits, the merge, then a merge touching
`package.json` and one not), a local bare repository as its `upstream`, and puts first on the PATH a fake `gh` (runs
and their attempts, release JSON), a fake `npm` (`whoami`, `view`, `stage list`, `stage approve`, the wiki's gates)
and a `git` that is the real one but for `git remote -v`, which names the organisation's repository on GitHub. The
`ship.mjs` the command runs is a fake committed in the scratch repository (it tags and pushes, as the real one, only
when the tag is absent). The command runs as typed, `tsx tools/release/prepare.ts <version>`, its waits on a virtual
clock: `QNC_RELEASE_CLOCK=virtual` makes `lib.mjs`'s `sleep` advance `clock()` at once, and `until` and the candidate's
deadline read that clock (registered in `wiki/data/env.json`).

Its first run found a bug on main: since #339 `release-run.ts` imported `humanGates` from `prepare.ts`, whose dispatch
does `await import('./release-run')` at its top level, so the import cycle never settled and the command exited at once
("Detected unsettled top-level await"), before saying anything. `humanGates` moved to `tools/release/gates.ts`
(re-exported by `prepare.ts`); a source test pins that `release-run.ts` never imports `./prepare`. Run with
`--first-parent` removed, the history scenario names the prepare commit, as 4.5.4 did.

The candidate wait decides through `candidateStep` (pure, tested): green is done; a first attempt failed or cancelled
is re-run once, `--failed` when a job failed, whole when none did (a run cancelled before any job failed said
`candidate cancelled ():` and re-ran `--failed`, which had nothing to re-run); a later attempt failed stops, whoever
re-ran it, the budget being the run's attempt number (`gh run view --json attempt`) instead of an in-memory flag that a
relaunch reset; a re-run asked while GitHub still shows the old attempt waits; an attempt still going after
`CANDIDATE_DEADLINE_MS` (3 h, said when the wait starts, counted again for the re-run's attempt) stops with the run's
link and the same command to resume. `ship`'s `rerunOnce` (main's `ci` for `ship tag`, a pull request's checks) reads
the attempt the same way: a run already at attempt 2 is not re-run, and a re-run it asked waits until GitHub shows it.

`prepare` and `check`: `check` has two more items, the passes sheet and the golden save (its index entry and its
file); `prepare` refuses a name with `( ) [ ] " « » \` \ $ < > |` (ruled: refused, never escaped; the README's link
`[v<v> (<name>)](…)` is read back by the next prepare, whose pattern stops at the first `)`) and a newest passes sheet
without `<!-- field:begin -->` (`passesSheet` cut at `indexOf` -1, now `passesSheetProblem`, checked before anything is
written); `changelogIntro` says "a major release after" for `x.0.0` and `LOG #N` for a single entry. The releasing page
(en, fr) says it.

→ next: 4.5.5's release, the first one this test ran before.
