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

Nothing to change in a game: it builds, plays and saves as on 4.5.5 (no content field, save, schema or game
fingerprint moves). Install `@quest-n-click/engine@4.5.6` ([Install from npm](install.from-npm.md)).

- **`npm run ids -- --write` rewrites the positional `seen` keys** of your sources (`house.grandma.0` becomes
  `topic.<id>`, and so for a `once` listener or a `once` choice option), where 4.5.5's `validate` named them one at a
  time. Run it once if `validate` lists such keys: the dry run gives each one with its line, and a second run changes
  nothing.
- **A project made by `npm init @quest-n-click`** has a test from the start: `game/tests/game.test.ts` (the game can
  be finished, a save reads back), a `vitest.config.ts` and `npm test`. An existing project adds the same three files
  by hand ([Project layout](create.project-layout.md)).
- **"Your first game" starts from npm** (`npm init @quest-n-click my-game "My Game"`). A project made before 4.5.2
  without `--engine` that fails with `ETARGET No matching version found for quest-n-click@…` finds its fix in
  [Troubleshooting](install.troubleshooting.md#npm-404).
- **For the maintainers**, `npm run release -- <version> --commit=<sha>` releases on a later commit of main when its
  CI is red on the release merge for a reason fixed after it ([Releasing](contribute.releasing.md#release-command));
  the nightly and the weekly prove start the evening before and skip a scheduled run that would start in the Paris
  working day; a red nightly opens a `nightly-red` issue, and the next green one closes it.
- **For contributors**, CI is steadier: the mutation runs are back to their speed (the 4.5.6 candidate recomputes
  every set once), a change outside what the tests run no longer empties the mutation cache, a slow apt mirror fails
  an attempt fast and the retry uses another, `wiki -- check` reads a page with CRLF line ends as with LF, and the
  lease tests no longer depend on Windows' timers.
