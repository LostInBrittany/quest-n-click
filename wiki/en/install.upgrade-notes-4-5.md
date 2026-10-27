# Upgrade notes: 4.5

What 4.5.0 "Wiki", 4.5.1, 4.5.2, 4.5.3, 4.5.4, 4.5.5 and 4.5.6 changed. Nothing to change in a game up to 4.5.1 (the documentation moved);
from 4.5.2, `npx quest-n-click migrate` moves its imports to the scoped package names; 4.5.3 changes how a release is
made, not a game.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## From 4.4.0 to 4.5.0 "Wiki"

Nothing to change: a game builds, plays and saves as on 4.4.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.0/…`. What is new:

- **The documentation is the wiki.** It lives in the GitHub wiki, in English and in French, and in the documentation
  of each release (`/docs/<version>/` on the project's site). The old pages under `docs/` are now transition pages:
  each old heading stays and links to its new place, so an old link still lands, and the complete 4.4.0 text stays
  readable at the tag `v4.4.0`.
- **`read_doc {name}` still works**: the eight names (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) answer one text block, with 4.4.0's arguments; the page is rebuilt from the wiki's
  sections, and a section too long for its bound is shortened to its heading, first paragraph and the
  `read_doc { id, section }` that gives the rest.
- **Two new MCP tools**: `search_docs` (by words or a question, in French or English) and `list_docs`; and
  `read_doc {id, section, lang}` reads one section of a page by its id. An agent searches first, then reads by id.
- **The package carries its documentation**, `docs-bundle/`: `npx quest-n-click mcp` in a created project reads it,
  where 4.4.0 found nothing to read.
- **Fixes**: `npx quest-n-click doctor` runs in a created project (Playwright is optional there); `npm run page:world`
  and `page:puzzles` write a `.html` file by default; a shared Studio accepts a lease on the scenario map's span
  (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## From 4.5.0 to 4.5.1

Nothing to change: a game builds, plays and saves as on 4.5.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.1/…`. What a game may use, each optional:

- **`games/<id>/spans.json`**: the spans of the game's own files (the modules its `index.ts` imports, its notes, its
  scripts), which a shared Studio refused to write before. The engine's rules come first; a file neither names is
  still refused ([span](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`**: a word the leak audit blocks that is also, by chance, a word of the game (a real
  person's first name), allowed by its SHA-1 prefix and a reason, in the game's folder and its built assets only
  ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` in `site.json`**: the game's public address. With it, the page's `og:image` is absolute and an `og:url` is
  added, so LinkedIn and Facebook show the share image; without it, the page is as on 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **The documentation**: the fixes of the maintainer's wiki audit (links whose label is code, the first tutorial,
  saves, the support window, search). A link to a page or a section of 4.5.0 still lands.

<a name="from-4-5-1-to-4-5-2"></a>
<!-- applies: 4.5.2.. -->

## From 4.5.1 to 4.5.2

The engine's packages are named under the npm organisation's scope (D53): `quest-n-click` is `@quest-n-click/engine`,
and `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` and `quest-n-click-studio-server` are
`@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` and `@quest-n-click/studio-server`. The
commands keep their names (`quest-n-click dev`, `npx quest-n-click migrate`, `npx quest-n-click-bridge serve`), and so
do the release's files (`quest-n-click-4.5.2.tgz`, …). A game builds, plays and saves as on 4.5.1. What a created
project changes:

1. Install the new engine in place of the old package (the archive's package is now `@quest-n-click/engine`):

   ```bash
   # in the created project
   npm uninstall quest-n-click
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.2/quest-n-click-4.5.2.tgz
   ```

2. Let `migrate` move the rest, then check:

   ```bash
   # in the created project
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renames the imports `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality` (and
   `quest-n-click-bridge/cli`) to `@quest-n-click/engine/…` (`@quest-n-click/bridge/cli`) in every source file;
   in `tsconfig.json`, the path `quest-n-click/*` and the `node_modules/quest-n-click/…` targets to
   `@quest-n-click/engine`; in `package.json`, it drops a dependency on an unscoped package once its scoped name is
   installed, and says which ones are left (`package.json depends on quest-n-click-bridge: npm uninstall
   quest-n-click-bridge && npm install @quest-n-click/bridge`). It renames no command: the scripts stay as they are.

- **Not migrated yet?** Through 4.5.x the unscoped imports `quest-n-click/…` still resolve, in a build (Vite) and in
  the engine's own `tsconfig.json`, so a game that has not run `migrate` still builds; its own `tsconfig.json` still
  points into `node_modules/quest-n-click`, which the new install removed, until `migrate` renames it.
- **A hosted Studio** renames a game's unscoped imports itself, at the engine's upgrade, as it did for the
  `web-scumm/…` ones ([Upgrade the hosted engine](team.upgrade-engine.md)).
- **The Bridge, the connectors and the Studio Server** install from their archives as before; in `node_modules`
  they are now under `@quest-n-click/` (`node_modules/@quest-n-click/bridge`, …).
- **A Studio worker's build hook** installs `requirements.txt`, which now carries every hash (D54):
  `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/@quest-n-click/engine/requirements.txt`. `ops/studio/worker-requirements.lock` is gone: a hook that
  names it fails until it is changed ([First deployment](clever.first-deployment.md)).
- **A new project** is created as before from the archive (`npx --package=<archive URL> quest-n-click create …`).
  Once the packages are on npm, `npm init @quest-n-click my-game` creates it in one command, and
  `npx create-quest-n-click my-game` still works: that unscoped name is a relay to `@quest-n-click/create`.
- **The repository's address** is `github.com/Quest-n-Click/quest-n-click` (D51). The old addresses redirect to it,
  release downloads included, so an archive URL already in a `package.json` still installs; write the new one when you
  next change it. A 4.5.2 file
  verifies with `gh attestation verify <file> -R Quest-n-Click/quest-n-click`; a release made before the move keeps
  its attestations under the user `wanoo` ([Releasing](contribute.releasing.md#expected-result)). The demo and the
  latest documentation are on the project's website, `quest-n-click.cleverapps.io`, not on GitHub Pages
  ([Play online](start.play-online.md)).
- **npm**: 4.5.2 is the first release whose packages release.yml stages on npm; they are published once an owner of
  the organisation approves them with 2FA, not before. Until `npm view @quest-n-click/engine version` answers 4.5.2,
  install from the archive ([Install from npm, once published](install.from-npm.md)). The unscoped names become
  deprecated pointers to the scoped ones.

<a name="from-4-5-2-to-4-5-3"></a>
<!-- applies: 4.5.3.. -->

## From 4.5.2 to 4.5.3 "One pass"

Nothing to change in a game: it builds, plays and saves as on 4.5.2 (no content field, save, schema or game
fingerprint moves). The engine installs from npm, `npm install @quest-n-click/engine@4.5.3` in a created project once
an owner has approved it, or from `releases/download/v4.5.3/…` ([Install from npm](install.from-npm.md)). What changes
is how a release is made, for the maintainers ([Releasing](contribute.releasing.md#the-chain)):

- **The candidate is the release's only test pass** (D55). The order stays: a candidate started by hand on main's
  commit, then a signed tag that names it. The tag's push starts `release.yml`, no longer the tag's own `ci` run (a tag
  runs no `ci` any more). It checks that the tag's commit is on main's first-parent line and that main's `ci` succeeded
  on it, that the previous stable tag is an ancestor and that the candidate is a green run started by hand on main,
  then publishes that candidate's files without testing anything again: minutes, not hours.
- **`ship tag` always waits for main's `ci`**: `--now` is refused, and `ship watch` waits for the release run alone.
- **A candidate made before 4.5.3 cannot be released**: the Remix catalogues' proofs are now made by the candidate (its
  `remix-proof` job) and a candidate without them is refused. Start a new one on the commit to tag.
- **The `docs-publish` environment needs a `v*` tag rule**, once: Settings → Environments → docs-publish → Deployment
  branches and tags, beside `main` and `docs/*`. The documentation job now runs on the tag's ref; without the rule it
  is refused, the release itself being published (`mode=promote` from main recovers the documentation)
  ([Releasing](contribute.releasing.md#maintainer-settings)).
- **npm's provenance names the tag and its commit**, no longer main's head as for 4.5.2.
- **Either co-maintainer signs a tag**: `.github/allowed_signers` names LostInBrittany's key beside wanoo's, and
  `ship preflight-stable` counts a name published by `lostinbrittany` or `wanoo` as the project's.
- **A translation pair checked by its AI author no longer stops a publication** (D56): `npm run wiki -- check
  --publish` lists such pairs among its gaps, a pair "to review" still fails it, and a published claim still needs a
  person's review. A page's header still says who read it ([Writing documentation](contribute.writing-docs.md#reviews)).
- **A pull request's candidate** starts only when the `full-ci` label is added; remove the label and add it again to
  run it once more.

<a name="from-4-5-3-to-4-5-4"></a>
<!-- applies: 4.5.4.. -->

## From 4.5.3 to 4.5.4 "Simple release"

Nothing to change in a game: it builds, plays and saves as on 4.5.3 (no content field, save, schema or game
fingerprint moves). Install `@quest-n-click/engine@4.5.4` ([Install from npm](install.from-npm.md)).

- **In a project made from npm**, the tools find its `game/`: the art prompts (`npx quest-n-click prompts`, the MCP's
  `asset_prompts`) name the project's paths, `cut-sheet.py` cuts into `game/art` by default, and the mouth kits run as
  `npx quest-n-click talk-kit`, `talk-apply`, `talk-normalize`. A new project's `.gitignore` lists `game/private`.
- **`cables`** takes `tipDeg`, `socketX`, `socketY` and `plugInset` to fit a game's own plug and board art.
- **A character's variant** (a costume, a prop) shows the moment its flag changes, in the middle of a conversation too.
- **The audio palette** gains `church_organ`, a full pipe organ that carries a lead.
- **For the maintainers**, a release is three actions (D57, [Releasing](contribute.releasing.md#release-command)):
  `npm run release -- prepare <version> --name="<name>"` makes the release pull request (its CI runs
  `npm run release -- check`, the docs' human gates included); its merge starts the candidate; `npm run release --
  <version>` signs the tag, follows the release and approves npm. The documentation publishes without a click under
  the `docs-publish` environment; the runs by hand wait for a reviewer under `docs-publish-manual`.
- **For contributors**, a pull request that touches no product code waits less, and a new test no longer means
  rewriting the READMEs' figures and the baseline.

<a name="from-4-5-4-to-4-5-5"></a>
<!-- applies: 4.5.5.. -->

## From 4.5.4 to 4.5.5 "Reworked CI"

Nothing to change in a game that validates: it builds, plays and saves as on 4.5.4 (no content field, save, schema
or game fingerprint moves). Install `@quest-n-click/engine@4.5.5` ([Install from npm](install.from-npm.md)).

- **`npm run validate` refuses a `seen` key that nothing records.** A `{ seen: 'room.npc.<n>' }` written for a topic
  that has an id was always false in a schema 3 game; it is now an error that names the key to write
  (`topic.<id>`, `event.<id>`, `choice.<id>`). If your game fails validation after the upgrade, that condition never
  worked: write the key the error gives.
- **A voiced line whose clip cannot play** (before the first tap, sound off, a missing file) stays on screen for its
  reading time instead of closing at once.
- **`npm run i18n -- extract`** writes the texts of a game's own minigames (`textParams`), so they no longer need to be
  added by hand and come back as `_stale`.
- **A dog in the image prompts:** a character whose `kind` holds `'dog'` gets the four-legged sheet with a dog's words.
- **In a project made from npm**, `npx quest-n-click page <name>` writes the phone pages (`storyboard`, `review`,
  `placement`, `world`, `puzzles`), and `page storyboard --readonly` a story to publish beside the game: the game's
  service worker no longer answers `pages/`.
- **For the maintainers**, a release is still three actions, now with one CI run each
  ([Releasing](contribute.releasing.md#release-command)):
  - `npm run release -- prepare` stops before the push until the prose is written and the claims are reviewed, then
    pushes once and warms the mutation cache, so the candidate takes about half an hour;
  - `npm run release -- <version>` finds the candidate of the merge, checks the docs' gates on the release commit
    before the tag (or releases with `--docs-revision`), survives a relaunch without re-running or re-verifying, and
    has an end-to-end test;
  - on `main`, only the release commit keeps a CI run of its own, every other merge cancels the one before.
- **For contributors**, a branch records its translation acks and claim reviews in its own `changes/<slug>.acks.json`,
  so two pull requests no longer conflict on `wiki/translations.json`; `npm run changes -- --check` refuses a fragment
  the release would stop on; the recurring flaky tests are fixed by cause, the unit shards take about the same time,
  and a slow apt mirror no longer fails the browser installs.

<a name="from-4-5-5-to-4-5-6"></a>
<!-- applies: 4.5.6.. -->

## From 4.5.5 to 4.5.6 "A stable CI"

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.5.5" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **`npm run wiki -- check` reads a page with CRLF line ends as the same page with LF (4.5.6, #367)**: on a page saved
  with CRLF (a Windows editor, or a copy of the wiki without the repository's `.gitattributes`), a code fence never
  opened (a regex's `.` stops at `\r`), so every link written inside a code block was checked as a real link and
  reported as an error. The page parser now reads `\r\n` as `\n`. A change to the wiki's own tools or to a
  `tests/wiki-*.test.ts` now also runs the CI's `windows` job, where #363's tests had failed, first seen on the release
  pull request.
- **`npm run release -- <version> --commit=<sha>` releases on a later commit of main than the release merge (4.5.6,
  #369)**: when main's `ci` is red on the release pull request's merge for a reason fixed only after it, as on 4.5.5
  (its `windows` job, fixed by #368), the release could never be tagged, since `release.yml` wants main's `ci` green on
  the tagged commit. The given commit stands for the release commit everywhere (the docs' gates, the candidate,
  `ship tag`, the release run); it is refused, with what to do, when it is not on main's first-parent line, not at the
  version, not the release merge or after it, or when the tag is already out on another commit. Without the flag,
  nothing changes.
- **The mutation cache's input hash follows only what a test runs (4.5.6, #371)**: a CRLF fix in the wiki checker
  (#368) moved `core`'s hash and re-ran every mutation set of the release candidate (about three hours of CI), through
  `vite.config.ts` → the Studio's dev-server plugin → `import type { DocsSet } from '../wiki/docs'`. The import closure
  now reads each module with the TypeScript parser and skips what the compiler erases (`import type`,
  `export type … from`, an import or re-export whose every name is a type, `typeof import('…')`); an import with one
  value in it is still followed. `vite.config.ts` and `vitest.mutation.config.ts` are hashed as files, and their
  imports followed only into what can change a test's run (`CONFIG_FOLLOWS`: the game's settings, the values of
  `define`, the test order, the sets), not into the Studio plugin (`CONFIG_SKIPS`, with its reason);
  `tests/mutate-hash.test.ts` fails on a new import in a configuration until it is placed. `core`'s inputs go from 260 files to 182, the largest set's
  (`reality`) from 363 to 217. Every set's key changes once with this release: the first candidate or nightly after it
  runs each set cold.
- **A slow apt mirror no longer spends CI's whole Playwright packages step on one attempt (4.5.6, #373)**: on main's
  run 40315817057, `studio-hosted`'s `scripts/ci-playwright-deps.sh` downloaded from `azure.archive.ubuntu.com` at
  about 40 kB/s, never a minute without a byte, and the step's 20 minutes ran out before the second attempt. An attempt
  now downloads first, `apt-get update` and the packages Playwright reports missing (`install-deps --dry-run`), bounded
  to 2 and 3 minutes by a `timeout` that sudo runs, so it kills apt-get itself before dpkg starts; then it installs them
  from apt's cache with nothing bounded, as #353 wants. A retry puts the runner's first mirror last
  (`/etc/apt/apt-mirrors.txt`), since apt changes mirrors on a failed file, never on a slow one; what an attempt
  fetched, partial files included, stays for the next.
- **The scheduled `nightly` and `prove` run in the night, never in the working day (4.5.6, #372)**: GitHub starts
  their scheduled runs hours after their cron times, every time: from 6 to 26 October 2026 the nightly (03:17 UTC)
  started 4 h 36 min to 7 h 44 min late and the weekly prove (Monday 04:00 UTC) 5 h 37 min to 7 h 40 min late, in the
  working day, where their jobs took the runners from a release's candidate and its pull requests. Their crons now
  start the evening before (the nightly at 20:17 UTC, the prove on Sunday at 20:00 UTC), so those delays land them
  between 00:53 and 04:01 UTC. A first `guard` job (`tools/schedule-guard.ts`, a few seconds of Node) skips every
  other job of a scheduled run that still starts in the Paris working day (07:00 to 20:00 Paris time, summer or
  winter), and the run stays green. A run by hand, the release's warm-up of the mutation cache among them, is never
  guarded.
- **CI's ffmpeg apt fallback no longer leaves an apt-get holding the dpkg lock, nor cuts dpkg (4.5.6, #374)**: when
  the static ffmpeg cannot be fetched from GitHub, `scripts/ci-ffmpeg.sh` ran `timeout 240 $SUDO apt-get …`, `timeout`
  above sudo, the shape #353 removed: it killed sudo, not apt-get, and its four minutes also covered dpkg. Now sudo runs
  `timeout`, apt-get's own parent, around `apt-get update` and `apt-get install --download-only ffmpeg` only; the
  install, from apt's cache, is not bounded and waits for a lock still held (`DPkg::Lock::Timeout`). The CI page no
  longer says `release.yml` installs ffmpeg (it has not since #291).
- **`npm run ids -- --write` rewrites the positional `seen` keys of the sources (4.5.6, #359)**: a `{ seen: key }`
  condition or a checkpoint's `seen` key that names the old place of a topic, a `once` listener or a `once` choice
  option (`house.grandma.0`, `event.house.2`, `choice.house.<text>`) becomes the key the engine records once that
  thing has an id (`topic.<id>`, `event.<id>`, `choice.<id>`), in the files the tool writes (`rooms/*.ts`,
  `rules.ts`, `items.ts`, `game.ts`); the dry run lists each one with its line. Before, the save migration renamed
  them in the saves but the sources kept the old keys, which then named nothing (since 4.5.5 the validator said so,
  one key at a time). The Studio's hosted migration writes them too. Texts, flags and keys nothing renames stay as
  they are; a second run changes nothing.
- **The lease renewal tests no longer depend on how fast the runner is (4.5.6, #388)**: main's `ci` went red on
  Windows only, in `tests/studio-engine-upgrade.test.ts`: a run of 30 ms with a renewal every 5 ms was expected to
  log two failed renewals, and Windows' coarse timers (about 15 ms a tick) fit only one. The operation under the lease
  now lasts until the second renewal has been logged (and, without a log, until the first renewal has run), and the
  owner's lease test waits for its two renewals the same way, so each proves what it did with no elapsed time to
  guess. Tests only; the Studio's lease is unchanged.
- **The mutation sets run at their old speed again, and `speedrun` in two shards (4.5.6, #387)**: since the unit
  shards' duration sequencer (#349, 4.5.5), `vitest.mutation.config.ts` inherited it from `vite.config.ts`. Each mutant
  runs its set's tests with `--bail 1`, and vitest's own order starts with the files that failed the run before, so the
  file that killed a mutant judges its neighbour first and kills it in a second; the duration sequencer started the
  longest files first instead. Every set ran two to five times longer, and `speedrun` (539 mutants in one job) went
  from 38 minutes to past the job's 120: the 4.5.6 warm-up cancelled it, and its candidate would have been red. The
  mutation config keeps vitest's own order (`BaseSequencer`), and `speedrun` runs in two shards: `verify.ts` (398
  mutants) alone, the envelope and the recorder (141) in the other.
- **A red nightly opens an issue, and the next green one closes it (4.5.6, #379)**: a red nightly told nobody but the
  cross on the Actions page, and on 26 October 2026 one was found at the next release's candidate, a day late. The
  nightly's last job, `report` (`tools/nightly-report.ts`, Node alone), reads every job's result: a job that failed,
  timed out or was cancelled opens an issue labelled `nightly-red`, or comments on the open one (one issue per red
  streak), with the date, the commit, the run's link, the red jobs and, for a failed mutation gate, the surviving
  mutants `docs/dev/mutants.json` does not name. The first green night comments "Green again on <run>" and closes it.
  A warm-up of the mutation cache reports a red gate too but never closes the issue; a run the `guard` skipped in the
  working day reports nothing. Only that job may write issues; the rest of the workflow keeps its read-only token.
- **"Your first game" starts from npm (4.5.6, #382)**: its first step said the packages were not on npm yet and walked
  a newcomer through a release archive's URL, then said they were. The engine is on npm from 4.5.2, so the page now
  starts with `npm init @quest-n-click my-game "My Game"`, `npm install`, the Python step, `npm run assets` and
  `npm run dev`; the archive is a short fallback (offline, a build pinned to a release's file) and the engine
  repository's path is unchanged. The other pages that still said so are fixed in both languages: "Not supported"
  no longer lists npm as missing, the upgrade page installs `@quest-n-click/engine@<version>` first, and the
  troubleshooting, archive and upgrade pages give the error a project made before 4.5.2 now meets
  (`ETARGET No matching version found for quest-n-click@…`, not a 404) with its fix. `install.from-npm` and
  `install.package` no longer wait for a relay that is republished, and name `npx @quest-n-click/create` as the
  alternative to `npm init`, in place of an unscoped `npx quest-n-click create` that has no command on npm.
- **A created project has a test from the start: `npm test` (4.5.6, #384)**: `npm init @quest-n-click` (`quest-n-click
  create`) used to leave the template's `tests/` out, so a new project had no test, no vitest and no `npm test`,
  although `@quest-n-click/engine/testing` is there for a game's own tests. It now writes `game/tests/game.test.ts`
  (the game can be finished from a new game, and a save reads back as written), a `vitest.config.ts` with no alias
  (the package's `exports` resolve `/testing`), and in `package.json` `"test": "vitest run"` with `vitest` as a
  development dependency, at the engine's own version. The test names no room: it uses the `layouts` that
  `game/index.ts` builds from `layout/*.json`, and it does not wait for a new game that ends on a guided action. It is
  the template's own `tests/game.test.ts`, which the engine repository runs with `GAME=_template`: one file for both.
  An existing project adds the same three files by hand ([layout of a created
  project](https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Project-Layout)).
