# Upgrade notes: 4.7

TODO(release): name 4.7.1 in this lead.

What 4.7.0 changed. Nothing to change in a game: it builds, plays and saves as on 4.6.0. Every addition is optional;
all but the end's `keepPlaying` are presentation only, unseen by rules, saves and the solver.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-6-0-to-4-7-0"></a>
<!-- applies: 4.7.0.. -->

## From 4.6.0 to 4.7.0

Install `@quest-n-click/engine@4.7.0` ([Install from npm](install.from-npm.md)). What a game may use, each optional:

- **A character turns back** once the hero is done with it: `turnBack: true` on the room's actor
  ([Rooms](create.rooms.md#actors)).
- **The title screen's logo and buttons placed by the game**: `titleScreen` takes `logoWidth`, `logoCenter`, `logoTop`
  and `buttonsTop`, in units of the 640 x 400 scene ([Title and credits](create.title-credits.md)). A logo padded with
  transparent space to place it can lose its padding.
- **Travel on foot on the map**: `vehicle: 'walk'` on a place walks the hero along the route with their `walk` frames
  ([World map](create.world-map.md)).
- **A map without pins, or with small dots**: `map.pins: 'hidden' | 'dots'`, for a map whose picture draws its places
  ([World map](create.world-map.md#bare-pins)). The default, `'faces'`, is as before.
- **A region's `frame` is drawn**, outlined on the parent's image once the region is open
  ([World map](create.world-map.md#regions)). Remove a frame painted into the parent's image.
- **Images per language**: `i18n.images` in `game.ts` names, for an image id, the image each language draws in its
  place ([Translations](create.translations.md#i18n-images)).
- **An end that rolls the credits, shows the title, and lets the world go on**: `{ end: true }` takes `credits`,
  `title` and `keepPlaying` ([Title and credits](create.title-credits.md#end-of-chapter)). With `keepPlaying`, the end
  is still reached and saved, but a load puts the player back in the world after it. A plain `{ end: true }` is
  unchanged.
- **The page's title and description per language**: `site.json` takes `i18n`, the `title`, `shortName` and
  `description` in the game's other languages ([Layout of a created project](create.project-layout.md#site-json)).

**For the TypeScript of a project**, additions only: `quest-n-click/player` exports the types `SiteText`, `SiteTexts`
and `EndShow`; `Presenter.end` takes an optional `EndShow`, and `GameState` an optional `keepPlaying`.

**Fixed**: a thing's name shown on hover stays inside the scene near its left or right edge, and the travel map shows
a child region only once a place in it, or below it, is unlocked (it offered an empty region from the start).

**Supported versions** change: only the latest minor gets fixes from 4.7.0, security fixes included; 4.6 gets none, so
upgrade. The windows promised before keep their dates ([Stability and support](start.stability.md#versions)).

**For the maintainers**, the release commands retry git's network steps and say the way on after a failure, and
`prepare` moves the versioned locks' engine peer on a new minor. **For contributors**, the `routes` mutation set is
gated, CI's `external-consumer` job asks for no runner when the plan spares it, and the coverage ratchet is strict on every
pull request (`npx tsx tools/coverage-ratchet.ts --write` raises the floors it names).

<a name="from-4-7-0-to-4-7-1"></a>
<!-- applies: 4.7.1.. -->

## From 4.7.0 to 4.7.1 "Shorter Road"

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.7.0" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **A download from GitHub's releases says each failed try, and tries for about three minutes (4.7.1, refs #410)**:
  the 4.7.0 candidate's external-consumer met five 504s in a minute on the older engine's download and stopped without
  a line; its re-run passed. Seven tries now, 5 s doubled up to a minute between them, each said; a 404 still fails at
  once. `upgrade-check` takes the older engine the same way (a single `gh release download` before), and so does
  `ops-qualify`'s 4.1.17 Bridge.
- **The wiki's clone, and a push that never reached the wiki, are tried again (4.7.1, refs #410)**: 4.7.0's
  `docs-publish` failed on one "Permission denied (publickey)" at the clone, with a key that worked on its re-run. Four
  tries, 15 s apart, as the release command's Git steps; a push the wiki refused (moved since the clone, a protected
  branch, a key without write access) still fails at once.
- **`e2e:studio-hosted`, a layout written meanwhile, read as a member sees it (4.7.1, #406)**: the step no longer
  clicks "Reload view" on the stale preview before the Studio reloads the view by itself (one navigation, not two).
  In Firefox, Playwright's handle on the editor's iframe can lose a navigation and never answer again while the
  view itself loaded and told the Studio so: a frame silent for 15 s now gets a new Studio page (a new iframe, a
  new handle) instead of a second click, which never brought it back. The step says how many `ready` messages the
  Studio received from the view meanwhile, and a frame that never answers fails the run in about a minute with that
  evidence, instead of holding it to its 8-minute limit.
- **`prepare` no longer stops at its "next mark" step (4.7.1)**: `npx tsx tools/next-mark.ts --write` waited on itself
  and exited 13 ("unsettled top-level await") with nothing written. Its CLI imports `tools/next-mark-records.ts`, which
  imported `rekey` and `textHashOf` back from it; they now live in `next-mark-records.ts`, so the import goes one way.
  The tests called the functions, never the command: a test now runs it with `--write` on a copy of the repository.
  The first `prepare` since #449 was the first to reach that step with the command.
- **`studio-hosted`'s Firefox pass quarantined (4.7.1, #406)**: the one test that fails at random ("a layout written
  meanwhile … shown undefined", in Firefox only) runs in a step of its own that does not block, and says so as a
  warning; Chromium's pass and both `studio-collab` passes still block. It struck four times in two days, the last
  on 4.7.0's release merge, whose `ci` the release requires green.
- **The releasing page says what 4.7.0's release tools do (4.7.1, refs #410)**: the re-run when no job ran, the way on
  from a red candidate (`--commit=<sha> --start-candidate`), the way back to `main` after `prepare`, Git's steps tried
  again, the locks' peers and an upgrade-notes section written ahead.
- **A flaky reality-cursor test no longer races a timer (4.7.1, refs #410)**: "SSE, two signals not settled, the first
  acknowledged from outside the loop" waits for the acknowledgement itself, so a loaded runner no longer sees `s1`
  twice.
- **`prepare` writes the release's prose it holds the facts of (4.7.1, #410)**: the LOG's release entry gets its
  bullets filled (the pull requests merged since the previous tag, the fragments and main's commit, the upgrade notes'
  section, the acks folded, the fixtures, the passes, the signature) and the passes sheet its intro when no pass
  changed. A fragment may carry `### Release` (and `### Release (fr)`), one or two sentences that `prepare` joins into
  the CHANGELOG's intro and the README's current-release line; `changes -- --check` checks their shape and still
  refuses any other heading. What stays a `TODO(release)`: the LOG entry's title, its request and its next, the
  upgrade notes' opener when `prepare` appends the section, and an intro or README line no fragment gave a line for. On
  the 4.5.3 fixture, 16 markers become 5.
- **Fragments, the wiki and comments name the next release `next`, not a guessed number (4.7.1, #443)**: a fragment
  writes `(next, #n)`; `npm run changes -- --assemble --version=<v>`, which `prepare` runs, writes the version in its
  place, and `changes -- --check` refuses a version after `package.json`'s. The wiki's prose (`(next)`), a section's
  `<!-- applies: next.. since next -->`, the manifest's `"appliesFrom": "next"` and a comment in the code roots or
  `tests/` use the same mark, rewritten by `prepare`'s new step `next mark` (`tools/next-mark.ts`), which carries the
  translation pairs and claim reviews recorded before over to the rewritten text: nothing is left to review. Never
  rewritten: a code span, code outside a comment, a string, a game folder, a historical file.
- **`release -- check` runs the tests that depend on the version (4.7.1, #443)**: `tests/mutants-json.test.ts`,
  `tests/quality-baseline.test.ts`, `tests/readme-truth.test.ts` and `tests/readme-release.test.ts`, under a second;
  `prepare` runs them in its stop before the push, so a release its pull request's CI would refuse (4.7.0's
  `mutants.json` entries due, its first visit typed in a test) stops on the maintainer's machine. Nothing is added to
  pull requests' CI.
- **Reading the named survivors again no longer re-runs every mutation set (4.7.1, refs #410)**: the mutation cache's
  input hash reads `docs/dev/mutants.json` as the mutants its entries name (file, operator, from, to, context), not
  their why, category, proof, owner or revisit, which are still checked on every run, a reused report included.
  4.7.0's release pull request moved every entry's revisit one minor on, and the candidate measured all 20 shards again
  (about ten runner-hours, the warm-up's included) against code that had not moved. Every cache key changes once with
  this change; the next nightly refills them.
- **The mutation jobs start with the longest (4.7.1, refs #410)**: the matrix the candidate, the nightly and a `full-ci`
  pull request run is ordered by the minutes each shard takes cold (`tools/mutation-minutes.json`, from 4.7.0's first
  candidate, no input of any set's hash), so the 8 jobs run at a time end together: a cold candidate's mutation from 114 min to about 81.
  `npx tsx tools/mutation-shards.ts --minutes` rebuilds the table from a run's jobs.
- **`prepare` no longer starts the mutation cache's warm-up (4.7.1, refs #410)**: it took about 110 min and the release
  pull requests of 4.6.0 and 4.7.0 merged after 24 and 52, so the candidate measured the same long shards beside it
  (about 600 runner-minutes a release, 8 runners held). The candidate's own cache step restores and saves the same
  keys. The pull request's body gives the command for a review that will last longer:
  `gh workflow run nightly --repo <repository> --ref main -f jobs=mutation`.
- **`prepare` names the mutation exemptions due at the version before it pushes (4.7.1, refs #410)**: its stop already
  failed on them through `tests/mutants-json.test.ts` (#443), with only that test's FAIL line; it now lists each entry
  due, `checkKnown`'s rule, and the way on (read it again, keep it with a later revisit or remove it, then
  `npm run test:mutation:core -- --doc`). 4.7.0's 135 were found by the release pull request's ci instead.
- **A later candidate of a version cancels an earlier red one (4.7.1, refs #410)**: the candidate's new `supersede` job
  cancels a candidate on `main` started before it, of another SHA whose `package.json` names the same version, still
  running with a job already failed or timed out; never a green or still-green run, another version's or a pull
  request's. Its runners go to the new run (4.6.0's and 4.7.0's first candidates ran 72 and 105 min red). Each
  candidate's name now says the SHA it tests. The release command stops on a candidate cancelled after a red job
  instead of re-running it, with the `--commit … --start-candidate` line.
