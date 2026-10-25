# Upgrade notes: 4.5

What 4.5.0 "Wiki", 4.5.1, 4.5.2, 4.5.3 and 4.5.4 changed. Nothing to change in a game up to 4.5.1 (the documentation moved);
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

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.5.3" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **The mouth-kit tools work in a created project** (#307): `tools/talk-kit.py` and `tools/talk-apply.py` read and
- **The art prompts name a created project's own paths**: in a project (`game/`, the engine in `node_modules`),
- **`cut-sheet.py` cuts into a project's `game/art` by default**: run from a project's folder (or through the
- **A character's variant shows the moment its flag changes (4.5.4, #316)**: a `{ set }` in the middle of a
- **The Studio Server's lock follows jose 6.2.13** (#299): Dependabot's `minor-and-patch` group moved `jose` from 6.2.12 to 6.2.13 (a refactor that keeps the cause of an error) in the root lock, and `scripts/locks/quest-n-click-studio-server.json` still pinned 6.2.12, so `pack` refused it and the `connectors` and `smoke` jobs failed. `npm run locks` brings that one lock in step; the other three locks are unchanged, and so is every version an install of the Studio Server takes, apart from jose.
- **A docs, tooling or release pull request waits less for its CI** (4.5.4, #302): the unit suite runs under coverage only when product code changes (the plan's new `coverage` gate), `windows` and `node-24` no longer run for the release and wiki tools nor for tests alone, `pwa-firefox` warns instead of failing `pr-gate` until #257 is fixed, and the candidate runs its mutation sets 8 at a time so pull requests are not queued behind it. `main`, a tag and `full-ci` still run everything.
- **`cables` fits a game's own plug and board art**: the plug's tip direction (120°), the sockets' place on the board
- **The unit suite runs in four shards at once** (4.5.4): CI's new `unit` job splits the suite and the asset tests in four (`--shard=<i>/4`), under coverage when product code changed; `coverage`, still the check the ruleset requires, merges the four reports (`npm run test:merge`, the floors of `vite.config.ts` on the whole suite), runs the ratchet, and is red when a shard is not. New scripts `test:unit` (the files of `test:coverage`, no instrumentation) and `test:merge`.
- **A new project's `.gitignore` lists `game/private`**: the raw sheets the art prompts save there stay out of git. In
- **The release pull request by one command** (4.5.4): `npm run release -- prepare <x.y.z> --name="<name>"` makes the branch `release/<version>` with every file a release branch wrote (version, CHANGELOG and LOG from the fragments, the LOG's release entry, the upgrade notes' section in both languages, transition pages, golden save, reference run, passes sheet and `passIssues`, the README's current-release line, quality baseline), `TODO(release)` where prose is needed, one commit and the pull request; `npm run release -- check <x.y.z>` says what is left before merging. `npm run changes -- --assemble` makes its own `## Unreleased` and folds a `.log.md` alone; the golden saves are listed in `tests/fixtures/saves/index.json`, so a release no longer changes the test file the save claims are reviewed on.
- **Two pull requests no longer conflict on the test count** (4.5.4): `npm run quality:baseline -- --check` compares the READMEs' figures with the committed `tests/quality-baseline.json`, not with what the checkout measures, so a pull request that adds tests passes without rewriting the READMEs and the baseline (it says the gain as `⚠ better than the baseline`); the figures move at the release (`npm run release -- prepare` runs `quality:baseline`) or whenever someone rewrites them. A changed behaviour still fails until it is rewritten on purpose.
- **The candidate of a release starts itself** (4.5.4): the release pull request's merge (a push to `main` that moves `package.json`'s version) starts `candidate` on the merge commit; `ship tag`, `release.yml` and the provenance check accept that run as they accept one started by hand on main, and it is qualified, fully profiled and attested the same way. A dependency bump starts none.
- **A docs problem shows on the release pull request, never after the tag** (4.5.4): its CI runs `npm run release -- check`, which now includes `npm run wiki -- check --publish --reviews-only` (every publication gate but "executed", which needs the candidate's report): a claim or a pair a person must read fails the pull request. The candidate then checks its docs against its own report, as a warning.
- **A release's docs publish without a click** (4.5.4): `docs-publish` runs a release's call under the environment `docs-publish` (no reviewer: the signed tag is the approval) and the runs by hand under `docs-publish-manual` (its reviewers approve each).
- **A `church_organ` FM patch in the audio palette**: a full pipe organ that carries a lead (a Toccata), beside the soft
- **A release is one command after the release pull request's merge** (4.5.4, D57): `npm run release -- <x.y.z>` refuses first what would fail later (not the merged release, uncommitted changes, no CHANGELOG section, no SSH signing, `gh` or `npm` not signed in, an npm user who is not an owner), finds the candidate the merge started and waits for it with its progress (its failed jobs re-run once), signs and pushes the tag (`ship tag`), follows the release and verifies it, then approves the staged npm packages with the maintainer's 2FA, the engine first. Run again after a stop, it goes on where it stopped.
