# Upgrade notes: 4.5

What 4.5.0 "Wiki", 4.5.1, 4.5.2, 4.5.3, 4.5.4 and 4.5.5 changed. Nothing to change in a game up to 4.5.1 (the documentation moved);
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

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.5.4" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **`npm run release -- <version>` finds the candidate of a merged release pull request (4.5.5)**: it looked for the
  release commit down every line of `package.json`'s history, the merged `release/<version>` branch included, so it
  named the `prepare` commit instead of the merge the candidate ran on and stopped with "no candidate of … on main".
  It now follows main's first parents only.
- **`prepare` starts the upgrade notes from whole CHANGELOG bullets (4.5.5, #333)**: the release's section of the
  upgrade notes listed each CHANGELOG bullet cut to its first line, often mid-sentence, so 4.5.4's had to be rewritten
  from the CHANGELOG by hand. Each bullet now comes whole, with its continuation lines, a nested list and an indented
  paragraph as written; the headings and the blank lines between bullets are left out, one list for the page.
- **`npm run changes -- --check` refuses a fragment the release would stop on (4.5.5, #335)**: it only asked whether a
  branch that changes the code carries a fragment, so `### Fixes` (#328) passed its pull request and would have stopped
  4.5.5's `npm run release -- prepare` at the changelog step. It now reads every fragment in `changes/` as `--assemble`
  does, with the same three headings, and names each problem with its file and line: a heading other than
  `### Breaking`, `### Fixed` or `### Changes`, text before the first heading, a `.log.md` that does not open on
  `## <title>`. CI's `check` job already runs it on every pull request.
- **A merge on `main` no longer cancels the previous commit's `ci` run (4.5.5, #337)**: `ci` ran in one group per
  ref and cancelled the run in progress, so on `main` a merge right after the release pull request's cancelled the
  release commit's run, the one its tag needs, and `ship tag` re-ran it (10 to 15 minutes on 4.5.4). A push to `main`
  now runs in a group of its own SHA and is never cancelled; on a pull request a newer push still cancels the run it
  supersedes. `qualify` follows the same rule.
- **`npm run release -- <version>` checks the docs' human gates on the release commit before the tag (4.5.5, #339)**:
  the release pull request's CI checked them on its own branch, so a claim merged to `main` before the release pull
  request (4.5.4's `import-layout-merges`, #318) was only found by `docs-publish`, an hour after the tag. The preflight
  now runs the same check on the release commit's own tree (a temporary worktree of it) and stops before anything is
  waited for, with each pending item and its command. That commit can no longer take a review, so the stop gives the
  way on: `--docs-revision` releases as usual, npm included, and prints the steps of the docs revision to publish after.
- **An install attempt that stalls in CI no longer spends the whole step (4.5.5, #340)**: the workflows' retry loops
  (`npm ci`, `pip install`, `playwright install --with-deps`, `docker pull`, the candidate's image and Studio install
  smokes, the release's pinned npm) give each of their three attempts its own `timeout <n>m` on Linux, and each step's
  `timeout-minutes` leaves room for the three and the two pauses. On #338 apt served a few kB/s under `playwright
  install --with-deps` and the first attempt ran out the step's 10 minutes, so the retries never ran; that step now has
  20 minutes, 6 an attempt, and the 8-minute install steps have 10. The macOS and Windows jobs keep the step's limit
  only (no `timeout` there), said in a comment. A test pins the rule over every workflow.
- **Only a release commit keeps its own `ci` run on `main`; a burst of merges no longer starves the pull requests
  (4.5.5, #345)**: since #337 every push of `main` ran in a group of its own SHA, never cancelled, and four merges in
  a row queued four full runs that took the runners from the pull requests. Now a push of `main` whose head commit is a
  release commit (the merge of `release/<x.y.z>`, or the subject `prepare` writes, which a squash lists and a rebase
  keeps) still runs in a group of its own SHA and is never cancelled; every other push of `main` shares one group and
  cancels the run it supersedes, as before #337. A `ci` run started by hand has a group of its own and cancels
  nothing. `qualify` cancels on `main` again: no release step reads its `main` run.
- **`npm run i18n -- extract` writes a custom minigame's texts (4.5.5, #250)**: the `textParams` a game's own minigame
  declares were left out of the locale files (only the built-in minigames' were written), so an author added their
  paths by hand and a later extract parked them as `_stale`. The extract, `i18n -- status` and the content report now
  read the game module's `minigames`, as the player and the validator already did.
- **A voiced line whose clip cannot play stays on screen for its reading time (4.5.5, #249)**: before the player's
  first gesture, with the sounds off, the voice volume at 0, or a clip that fails to load or play, the speech bubble
  used to close at once; it now shows for the reading time an unvoiced line gets (what remains of it when the clip
  fails late). A clip that plays still sets the line's length, and a tap still skips it. `create.voices` (en, fr) no
  longer states it as a limit.
- **The four unit shards take about the same time (4.5.5, #349)**: vitest's `--shard` gave each shard as many files,
  in the order of a hash of their paths, and 4.5.4's shard 4 ran its tests in about 85 s when the others took 150 to
  270 s. The sequencer of `vite.config.ts` (`tools/unit-shards.ts`) now splits by each file's duration, recorded in
  `tools/unit-durations.json`: a shard's time counts as the larger of its longest file and its total over two, each
  file goes to the shard it leaves the shortest, the longest file of a shard starts first, and a file the table does
  not know counts as the median. `npx tsx tools/unit-shards.ts --record <vitest json report>` refreshes the table.
- **A change to `tools/studio/diff-rooms.ts` runs `studio-hosted` (#349)**: the CI plan's hosted-Studio rule named it,
  but the generic `tools/` rule came first and took it; it has its own rule now, before that one.
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
- **A slow apt mirror no longer makes CI's Playwright install fail on a lock (4.5.5, #353)**: since #340 each attempt
  of `npx playwright install --with-deps` ran under `timeout`, which killed Playwright but not the apt-get it started
  through sudo; that apt-get went on holding the dpkg lock, and the second and third attempts failed on it at once
  (#350). The four jobs that install browsers on the runner (`studio-hosted`, the candidate's `release-core` and
  `cross-runtime`, the nightly's `cross-runtime`) now install Playwright's system packages with
  `scripts/ci-playwright-deps.sh`, never under `timeout`: apt fails by itself when the mirror sends nothing for a minute,
  retries a file, and waits for a lock still held; the browsers' download keeps its limit an attempt. `studio-hosted`
  has 40 minutes instead of 30 for a slow mirror.
- **The recurring CI flakes of the last two weeks, by cause (4.5.5, #356)**: the unit tests that passed alone and
  timed out in a loaded run cost less where the cost was their fixture's (the scenario map imports the game once per
  state of its files instead of a child per call; the wiki push copies one seeded repository and reads its tip without
  a clone, a test 0.04 to 1.4 s where it took 0.8 to 4.5), and set their own limit, with a comment that says why,
  where the processes are the test's subject (real bash steps, git pushes, Python cuts, real-time walks, the whole
  wiki's bundle). `e2e:studio-hosted` clicks "Reload view" once more when Firefox's room editor stays silent 15 s, as
  its step 6b does since #264; `e2e:pwa` asks WebKit's "due to access control checks" loads again offline the same
  way and counts only those refused again; the walkthrough waits for the title screen before reading it. Nothing is
  skipped; the CI page's "Known flakes" table says each.
- **A wiki claim's test is found under a comment that ends a sentence (4.5.5, #356)**: the claims' scanner of test
  names read the character before `describe(` in the raw source, so a comment ending with a period right above a
  describe made it a method call and dropped its title (`studio.map`'s `groupings-only` went "not referenced" when its
  block got a comment). It reads the last significant character now, never a comment's.
- **`npm run validate` refuses a `seen` key that nothing records (4.5.5, #248)**: a topic with an id is recorded as
  `topic.<id>`, so `{ seen: 'house.grandma.0' }` (the positional form of the 3.x pages) was silently false in a
  schema 3 game. The validator now checks every `seen` key a condition reads or a checkpoint marks against the
  topics, `once` listeners, `once` choice options and Reality signals of the game; when the key is the old place of
  something that has an id, the error names the key to write (`topic.<id>`, `event.<id>`, `choice.<id>`).
  `create.conditions` (en, fr) no longer states it as a limit, and its key table lists `reality.<signal>`.
- **A `TODO(release)` quoted as code is not a marker left (4.5.5, #364)**: `prepare`'s stop before the push and
  `npm run release -- check` counted every line holding the text, so a CHANGELOG bullet about the markers, copied
  whole into the upgrade notes, was a marker no one could ever write, and 4.5.5's release could not pass (found by a
  rehearsal). An occurrence in backticks or a fenced block is now a quotation; every marker `prepare` writes is bare
  prose and still counts. `npm run changes -- --check` refuses a fragment with a bare `TODO(release)`, which would
  land in the CHANGELOG or the LOG the same way, and the LOG title that had one now quotes it.
- **A read-only storyboard to publish beside the game (4.5.5, #318)**: `npm run page:storyboard -- --readonly` renders
  the same story without the notes box, the rewrites or any saving, with a `noindex, nofollow` meta. The game's service
  worker no longer answers `pages/` with the game, so such a page (or any page a game publishes beside itself under
  `pages/`) can live in the same `dist/`.
- **`quest-n-click page` in a created project (4.5.5, #318)**: the phone pages (`storyboard`, with `--md` and
  `--readonly`, `review`, `placement`, `world`, `puzzles`) were only `npm run page:*` scripts of the engine repository;
  a project now writes them with `npx quest-n-click page <name> [options]`. Found while moving clever-onboarding onto
  the npm package, whose deploy script becomes `npx quest-n-click page storyboard --readonly --out
  dist/pages/storyboard-$SLUG.html`.
- **A dog in the image prompts (4.5.5, #317)**: `npm run prompts` draws a character whose `kind` holds `'dog'` on the
  four-legged sheet, the cat's cells (the same `cat()` helper and pose keys) described with a dog's words ("barking",
  "panting happily, tongue out", "stretching in a play bow"), so a game's dog no longer gets a cat's meowing and purring.
- **The unit suite can be green on a developer's Mac (4.5.5, #320)**: the Telnet connector's stress test (a thousand
  connections at once, which macOS's default limits fail) runs only where `CI` is set, as on every GitHub Actions
  job, or with `TELNET_STRESS=1`; skipped otherwise.
- **`prepare` checks the docs' human gates before it pushes (4.5.5)**: `npm run release -- prepare` runs
  `wiki -- check --publish --reviews-only`, the check the release pull request's CI fails on, after its commit. A claim
  or a pair still to review stops it there, nothing pushed and no pull request, each printed with its command for a
  person to type (the tool never records a review); run the same command again once they are committed and it resumes
  at the gates on `release/<version>`, then pushes and opens the pull request, so its CI runs once. On `main`,
  `npm run release -- check <version>` lists them earlier.
- **`prepare` stops before the push on `TODO(release)` prose too (4.5.5)**: the stop before the push now covers the
  `TODO(release)` markers left in the release's files (the same ones `npm run release -- check` counts) as well as the
  docs' human gates, in one stop: each marker with its file, line and brief, each review with its command, nothing
  pushed. Write the prose yourself or ask your AI assistant to, with those markers as the brief, read the diff, record
  the reviews, commit on `release/<version>` and run the same `prepare` again: it pushes and opens the pull request
  only when nothing is left, so its CI runs once. The tool still writes no prose, records no review and calls no AI.
- **A release's candidate reuses the nightly's mutation measures (4.5.5, #329)**: the nightly's mutation shards, still
  measured from scratch, now save each passed gated shard's report in the cache on `main`, under the very key the
  candidate restores (the shard and its set's input hash). The candidate a release's merge starts then runs again only
  the sets whose inputs moved since the night, the others reused in a minute or two each: the same gate, about half an
  hour instead of over an hour when nothing shared by every set moved. `gh workflow run nightly --ref main -f
  jobs=mutation` runs the mutation jobs only, reusing what is cached: a warm-up after a release's last merge. The
  nightly's matrix runs 8 shards at a time, as the candidate's.
- **`prepare` starts the mutation cache's warm-up when it pushes (4.5.5, #331)**: once the release pull request is
  pushed, `npm run release -- prepare` runs `gh workflow run nightly --repo <the organisation's repository> --ref main
  -f jobs=mutation` (#330) and prints the run's link; the pull request's body says it too. The release commit moves
  only version fields, outside the mutation input hashes, so the cache filled while the pull request is in review is
  the one the candidate its merge starts reads: nobody has to remember the warm-up. A dispatch refused is a warning with
  that command to run by hand, never a failure; a stop before the push starts nothing; `--no-pr` starts nothing and
  prints the command.
- **A resumed `npm run release -- <version>` verifies the release once (4.5.5, #343)**: run again after a stop (4.5.4's
  at the npm 2FA step), it ran `ship verify` from scratch, about 5 minutes on 35 files. After a passing verify it now
  records the tag object, its commit, the release and each asset's digest in
  `.cache/release/v<version>.verified.json`, and a later run skips the verify only when all of it is still exactly
  there and the release is immutable, saying when it passed; otherwise, or with `--reverify`, it verifies again.
  `ship verify` and the release workflow's own verify are unchanged.
- **The CI page says what the workflows do since 4.5.3 (#349)**: a tag runs no `ci`; `release` starts on the tag's
  push and tests nothing again; the candidate starts on the release pull request's merge and is the release's only
  test pass; `release -- prepare` warms the nightly's mutation cache; the shards by duration. Two comments of
  `ci.yml` and `pr-gate`'s line for a skipped mutation job said otherwise.
- **An end-to-end test of the release command (4.5.5, #348)**: `tests/release-command.test.ts` runs
  `npm run release -- <version>` through its CLI dispatch on a scratch repository shaped like 4.5.4's history, against
  fake `gh`, `npm` and `ship`, its waits on a virtual clock (`QNC_RELEASE_CLOCK=virtual`): the merge found as the
  release commit, a candidate failed or cancelled then re-run, a relaunch after the tag, a failing docs-publish, an
  empty or partial `npm stage list`, main's `ci` cancelled then re-run.
- **A branch records its translation acks and claim reviews in its own pending file: two pull requests no longer
  conflict on `wiki/translations.json` (4.5.5, #360)**: on an open branch, `npm run wiki -- translations --ack` and
  `review-claim` write `changes/<slug>.acks.json` (the branch without its prefix, as for the fragments) instead of
  `wiki/translations.json` and `wiki/reviews.json`, which only `main`, `master` and a `release/*` branch write. Every
  reader (`wiki -- check`, `--publish`, the release's gates, `candidate`, `docs-publish`, the page headers) sees the
  two files plus the pending ones: the records of the current text win, their reviewers merged. The release's
  `prepare` folds them in a new step, `wiki acks` (`npm run wiki -- acks --fold`): what still holds goes into the two
  files, the pending files are deleted, and what no longer holds is listed with its reviewers and the command to record
  it again, and repeated in prepare's stop. A doc revision's reviews on `docs/<v>` land in `changes/<v>.acks.json`,
  which its publication accepts as documentation. A detached HEAD needs `--pending <slug>`. Records of a section or
  claim gone are no longer warnings: the fold removes them.
