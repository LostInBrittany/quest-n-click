# Upgrade notes: 4.7

TODO(release): name 4.7.3 in this lead.

What 4.7.0 changed, then 4.7.1 and 4.7.2. Nothing to change in a game: it builds, plays and saves as on 4.6.0. Every addition is optional;
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

Nothing to change in a game: it builds, plays and saves as on 4.7.0. No engine, Studio or Bridge code moved; 4.7.1
is the release tools and CI.

**For the maintainers**, `npm run release -- prepare` writes most of a release's prose: the LOG entry's facts, and the
CHANGELOG's intro and README line from the `### Release` lines each pull request leaves in its fragment. A branch names
the release it lands in with the mark `(next, #n)`, and the release writes the number. `release -- check` runs the
tests the version moves before the release pull request does. A new candidate cancels an earlier one of the same
version that has already failed, the mutation jobs start with the longest, their cache survives a reread of
`docs/dev/mutants.json`, and `prepare` no longer starts the mutation warm-up. A download from GitHub's releases and
the wiki's clone are tried again.

**For contributors**, a fragment writes `(next, #n)` where it wrote a guessed version, and `changes -- --check`
refuses a version after `package.json`'s. `studio-hosted`'s Firefox pass is quarantined: it warns instead of failing
until #406 is closed.

<a name="from-4-7-1-to-4-7-2"></a>
<!-- applies: 4.7.2.. -->

## From 4.7.1 to 4.7.2 "Audit fixes"

Nothing to change in a game: it builds, plays and saves as on 4.7.1. 4.7.2 fixes what an audit of 4.7.1 found in the
package, the Studio, the Studio Server, the connectors and the Bridge; three of the fixes change what a host sees.

**In a game project**, `npm run studio` starts again from the installed engine (#454): the package now ships
`AGENTS.md`, which the Studio's assistant imports, and no longer ships the maintainers' benches and release commands,
which could not run outside the repository. In a room with exits, the Studio's "+ Reaction" works again (#461):
it asked for a place after the exits' own reactions, which the room's file does not hold.

**For the local Studio**, its guard covers its routes in any letter case, and outside LAN mode it answers this machine
only: `npm run studio -- --host` (or `dev -- --host`) now gets 403 from another address, a container's port mapping
included. Serve a phone or a container with `npm run studio:lan` and its token.

**For a Studio Server**, nothing to configure. An agent's `set_storyboard` or `set_layout` is refused (409) when a
teammate wrote the file since the agent read it; the agent reads it again. A session checked by two instances at once
is refreshed once, so a provider that detects refresh-token reuse no longer ends sessions during a deploy. The
back-channel logout answers 413 to a body over 16 KiB without keeping it, `gc --delete` keeps a blob stored again
while it runs, and a git push or import reads the blobs eight at a time.

**For a connector's host**, two changes of behaviour:

- **Open Badges**: only a recipient hashed with the player's email makes a badge `valid`. A badge whose recipient can
  be read in the badge (a clear email, a URL, a DID, an Open Badges 3.0 `credentialSubject.id`) now gives
  `indeterminate`; ask the issuer for hashed recipients. A valid badge counts for the first player who redeems it;
  another gets 409 `{"status":"valid","signal":"claimed"}`. That record is kept in memory and a restart forgets it.
- **Email over IMAP**: the connector marks each message it handles with the keyword `$QuestNClick`, and retention and
  the deletion after acceptance remove only those, by UID. A server without UIDPLUS keeps them marked `\Deleted`
  (logged once as `email.expunge-unsupported`). A dedicated folder (`imap.mailbox`) is still the recommended setup.

**For a Bridge's host**, one new limit: `limits.pairingsPerAddress` (default 5) is how many pairing codes one address
may ask per 10 minutes, per tenant; beyond, `POST /v1/pairings` answers 429. A host pairing many players from one
address (a test bench, a kiosk) raises it in `config.json`. IPv6 clients count as one address per /64, so their quota
counters start again once. The rest needs nothing: a tenant's run retention deletes its own runs only, an
acknowledgement never brings back a revoked or deleted player, a signal is never written for one revoked meanwhile, an
event stream dropped while it opens no longer counts against `streamsPerPlayer`, and on a SQL store the Mystery commit
quota (`commitsPerHour`) holds across instances.

<a name="from-4-7-2-to-4-7-3"></a>
<!-- applies: 4.7.3.. -->

## From 4.7.2 to 4.7.3 "Shipshape"

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.7.2" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **The candidate's `connector-archive-e2e` follows #459 and #460 (4.7.3)**: its fake IMAP server answers `CAPABILITY`
  with UIDPLUS and `UID EXPUNGE`, and its search reads `KEYWORD` and `UNDELETED`, as the email connector now asks
  (it no longer sends a bare `EXPUNGE`, which the fake server now refuses); and the Bridge it starts raises
  `limits.pairingsPerAddress`, since every player of the script is paired from `127.0.0.1` (seven, over the default 5).
  4.7.2's first candidate failed on it: the script runs only in the candidate, on the packed archives.
- **The mutation sets pass again after #458, #459 and #460 (4.7.3)**: eleven survivors in code those three changed, in
  no test and in no entry of `docs/dev/mutants.json`, stopped five sets (`reality`, `runs`, `connectors-edge`,
  `studio-auth`, `studio-workshop`) in 4.7.2's candidate and in the nightly. Each is now killed by a short test: a
  player revoked while its proposal waits for the lock is refused as a player first; a purge naming no tenant purges
  every tenant; only a valid badge is claimed by its first player; the IMAP pass says once, and only when the server
  cannot, that it cannot expunge; a refresh already in flight is joined, and a definitive refusal keeps the claim; a
  form body of exactly its limit is read; and the collection keeps a blob read again at exactly its grace period.
- **The installs from the registry without a lockfile try again on a registry hiccup (4.7.3, #471)**: `fresh-install`,
  `upgrade-check`, `external-consumer`, `connector-archive-e2e`, `studio-install-smoke`, the qualification's backup
  step and the PR's connectors job each ran `npm install` once, and failed when the registry's index listed a version
  whose tarball its CDN did not serve yet (run 42633058102: a 404 on `rollup` `4.68.2`'s tarball, published a minute
  before). One helper in `scripts/lib/archive-harness.mjs` now tries again after 30, 60 and 120 s on a 404 on a
  tarball, `ETARGET`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, a 429 or a 5xx, says each new try and why on stderr, and
  asks the registry again rather than its cache (`--prefer-online`). Any other failure – a name that does not exist, a
  peer conflict, a build script – still fails at once, with npm's own output.
- **The Studio's Git tests have 60 s on Windows (4.7.3, #471)**: two of them passed 30 s on a slow Windows runner in run
  42633058102. Linux and macOS keep 30 s.
- **A candidate is the run whose name says the commit it tests (4.7.3, #471)**: the release command found a commit's
  candidate by the run's head, which for a dispatch is main's tip. So `--commit=<not the tip> --start-candidate` never
  found the run it had just started (it gave up after five minutes and started another), and a run started at the tip
  for an older commit counted as the tip's candidate, until `ship tag` refused it. It now reads `candidate <sha>` in
  the run's name, as `ship tag` does.
- **A sealed ending that could not be opened no longer ends the game (4.7.3, #475)**: a mistyped password, or the sealed
  file unreachable offline, showed "…" and still saved the game as finished, so that save could never show the ending.
  The game now goes on and nothing is saved as finished. A wrong typed password is asked again, and an empty answer
  gives up. For a host: `Presenter.ending('open')` may return `false` when nothing was unsealed; a presenter that
  returns nothing behaves as before.
- **The dev server no longer serves a game's `private/` folder (4.7.3, #477)**: in `npm run dev:lan` or `studio:lan`,
  anyone on the same network could fetch `/games/<id>/private/…` – the raw sheets and the real ending's configuration
  – without the token, which guards only the Studio's routes. Vite's `server.fs.deny` now lists `**/private/**` (with
  Vite's own defaults), in the engine repo and in a game project: such a path answers 403, encoded, upper-case or
  through `/@fs/`.
- **The Bridge's journal survives a nearly full disk (4.7.3, #479)**: a write there can take part of what it is given
  and say so without failing, and the default store never checked. `bridge compact` or forgetting a player could
  rename a cut file over the journal, losing every line after the cut; an append could leave a torn line that the
  next one joined, so the Bridge refused to start. Every byte is now written or the write fails: a rewrite fails
  before its rename and leaves the journal whole, and a failed append takes its cut line back.
- **A malformed trusted-proxy network is refused at start (4.7.3, #483)**: `--trust-proxy=10.0.0.0/` (the Bridge) or
  `"trustProxy": ["10.0.0.0/"]` (the Studio Server) read the empty prefix as `/0` and trusted every address, so any
  client could pick its own `X-Forwarded-For` and step around the per-address limits; `/33` or `/abc` gave odd masks
  too. Both servers now stop at start with an error naming the entry, and such an entry never matches. Plain addresses
  and `a.b.c.d/0` to `/32` behave as before.
- **A write that reuses another member's operation id is applied (4.7.3, #485)**: on a Studio Server, a member who sent
  an `x-studio-op` another member had already used got a 200 and a new id back, but nothing was written. Each member's
  operation ids are now their own: a retry by the same member is still applied once, the same id from someone else is
  a write like any other.
- **A looping script restarted during a step no longer skips its next step (4.7.3, #484)**: leaving and re-entering a
  room, or switching character, while a looping script was inside a `wait` started a second copy of the loop. The two
  copies both moved the script on, so the command after the `wait` was skipped (a counter not counted, a line not
  said), and a later `startScript` could start a third copy. The loop that is already running now simply goes on.
- **The engine installs with npm 12 (4.7.3)**: `navmesh@2.3.1`, the walk areas' paths, declares
  `"javascript-astar": "github:mikewesthad/javascript-astar"`, a git dependency, and npm 12 refuses git dependencies by
  default (`allow-git` is `none`). Every install that reached it stopped with `EALLOWGIT` – a game's
  `npm install @quest-n-click/engine` and this repository's `npm ci` alike. The engine now carries navmesh's build
  itself (`src/engine/core/nav/navmesh/`, its first line byte for byte, its licence beside it), so `navmesh`,
  `javascript-astar` and `core-js` leave the dependencies; paths are unchanged. A build's `THIRD_PARTY_NOTICES.txt` and
  the engine's SBOM still name it, and a test fails if a lock of the repository takes a package from git again.
- **An email whose subject is one word that looks like a pairing code is read as an answer again (4.7.3, #491)**: a
  linked or tagged player who wrote `Treasure`, `Thursday` or `Gardener` as the subject had the message taken for a
  pairing code, refused by the Bridge and dropped (`pairing-pairing`, a 422 or a flagged message), so the answer was
  lost. A code alone that the Bridge refuses, from a sender the connector already knows, now goes on to the answers;
  `PAIR …`, `LINK …` and `CODE …` still reject a refused code. The connector also reads a code with the Bridge's own
  letters only (no `L`), shared with the terminal connectors.
- **npm and npx start on Windows again from the dev tools (4.7.3, #490)**: on Windows with Node 22, `npm run dev:lan`
  and `studio:lan` crashed at once with `spawn EINVAL`, the Studio's Assets "Prepare" answered an error, the
  Assistant's and the MCP server's `run_tests` returned `spawn npx ENOENT`, and `npm run new-game` created the game
  without selecting it. Each now runs `npm.cmd` / `npx.cmd` through the shell there, as the packing scripts already did.
- **A topic that changes room or ends the game closes the conversation (4.7.3, #494)**: after a topic whose `do` has a
  `goto`, an `end` or a sealed ending, the menu of the room just left came back, and another topic then ran against
  that old room (and was saved so with the talk verb). The conversation now closes as "Bye" does. No shipped game had
  such a topic.
- **A read made during a Git import or an engine upgrade no longer mixes two revisions (4.7.3, #496)**: on a Studio
  Server, a room opened while an owner's import or upgrade was writing could show the room's code of one revision with
  the layout of the next, under the older revision's number. Those two writes now hold the instance's lock like any
  other write: a read made meanwhile waits a moment and shows the whole new revision.
- **A save migration now follows the other playable characters too (4.7.3, #495)**: `renameItem`, `dropItem` and
  `renameRoom` changed only the active player. An item renamed in another character's inventory or `used` was pruned
  on load with a warning (a key lost that way could make the game unwinnable), and a character standing in a renamed
  room was sent back to their start room. The step now renames and drops in every record of `players`: inventory,
  `used`, room and positions.
- **The Bridge's open streams are indexed by player (4.7.3, #501)**: the pass every 5 s that covers a lost wake-up, and
  each wake-up, scanned every open stream of the instance once per player: about 580 ms of blocked event loop per pass
  at 10 000 streams, the default `streamsPerInstance`. A wake-up, the per-player limit check and the revocation of a
  player now read only that player's streams (about 6 ms for the same pass). Nothing changes in what a stream receives.
- **The email webhook's and the Open Badges endpoint's limit per address holds against IPv6 and many clients (4.7.3,
  #500)**: `perMinutePerIp` gave each IPv6 address its own budget, so one host, usually handed a whole /64, was never
  limited; and above 10 000 addresses in memory, every request walked them all. An IPv6 address now counts by its /64
  (an IPv4-mapped one as its IPv4), as the Bridge's limits do since 4.7.2, and the idle addresses are swept at most
  once a minute.
- **A Solve no longer freezes the team's Studio (4.7.3, #502)**: on a hosted Studio, a Check run (solve, lint,
  playtests, validate) held the instance's lock for as long as the worker ran it, up to 45 s for a solve, and a write
  sent meanwhile waited for it, with every read queued behind that write. The lock is now held only while the game's
  files are packed for the worker: saves and page loads go through at once, and the result still says the revision it
  was packed at.
- **The website's demo goes through the spoiler check before it is published (4.7.3, #507)**: the candidate built
  `web.tar.gz` (the game and the Studio demo under `/demo/`) with a plain `vite build`, which runs no
  `check:spoilers`, and that build ships the storyboard and the owner's notes as JSON in
  `studio-demo/snapshot.json`. One ending line in a note would have reached the website. The candidate now runs
  `npm run check:spoilers` on it before packing it, and `ci` runs it on the same two-entry build, so a pull request
  that puts ending text in the storyboard or a note fails there rather than at the release.
- **CI runs `e2e:portrait` (4.7.3, #508)**: the only check of the 4.6.0 `skin.portrait` layout (the rotate overlay, the
  panel at five upright sizes with and without safe areas, 44 px touch targets, a turn to landscape and back) ran only
  by hand. It is now a step of the `e2e` job's Chromium `full` row, on the sample game's production build that row
  already serves, under the same `e2e` gate; its screenshots land with the row's on a failure.
- **Two CLI runs asking for a Studio token at once no longer crash (4.7.3, #512)**: when one `studio-server token` or
  `login` released the token file's lock just as another found it taken, the second failed with
  `TypeError: Cannot read properties of undefined (reading 'mtimeMs')`. It now takes the free lock on its next try.
- **A pull request that changes tests runs the unit suite under coverage (4.7.3, #520)**: the CI plan left the
  `coverage` gate off for every file under `tests/`, so the strict ratchet never saw a test that lifted a file above
  its floor, and `main` failed in `coverage` after the merge (six runs between 30 October and 5 November, after #425:
  "route-runtime.ts branches: floor 87, measured 97.35"). The tests now open `coverage`, the hosted Studio's and the
  wiki's tests too, beside their own gates; the pull request raises its floors (`npx tsx tools/coverage-ratchet.ts
  --write`) before it merges. The unit shards ran on every change already: what is added is the instrumentation and
  the merge, within the shards' usual spread.
- **The mutation gate is green again after the audit fixes (4.7.3, #528)**: eleven survivors in code merged by #480,
  #498, #503 and #504, in no test and in no entry of `docs/dev/mutants.json`, stopped four sets (`core`, `reality`,
  `reality-store`, `connectors-edge`) in the candidate of #527. Each is now killed by a test: a migration gives
  another player no `used` key it did not have; the groups after `::` land in their place in the connectors' IPv6
  /64 key, and an address a socket never gives keys by its text; a journal write cut short writes the rest from
  where it stopped; and the streams' per-player index test now judges the `reality-store` set.
- **The vendored navmesh can no longer drop out of the notices and the SBOM in silence (4.7.3)**: a build's
  `THIRD_PARTY_NOTICES.txt` and the engine's SBOM read navmesh from `src/engine/core/nav/navmesh/vendored.json`, and
  both took a missing record for an empty list. Now the build's seal, `verify:dist` and `scripts/sbom.mjs` fail with
  the file's path, and `verify:dist` also fails when the notices do not name navmesh. The record lists what navmesh's
  build contains as data (`bundled`), so javascript-astar is a component of the SBOM, nested in navmesh's with its
  `pkg:github` purl and in the dependency graph, where scanners see it; before, it was only words in a description.
  One module, `tools/vendored.mjs`, reads the record for both outputs, and tests prove what each output gets.
- **The SQLite fan-out test no longer times out on a slow CI runner (4.7.3, #544)**: it timed out twice in one day while
  its signals were only late, not lost (SQLite on the runner 100 to 300 times slower than on a laptop; 1 050 runs under
  delays and CPU load lost none). It now has 30 s for a 10 s wait, and a failure says when each sequence arrived, how
  many the store holds and what B logged, so a late runner reads apart from a lost wake-up. Nothing changes for a host.
- **The SQL store's duplicate-when-full answer is tested in one process (4.7.3)**: `SqlRunStore.admit`'s
  `if (dup) return 'duplicate'` forced false was killed only by the three-process race of
  `tests/bridge-admission.test.ts`, when a duplicate happened to arrive after the queue was full; in the other
  interleavings the insert's unique key answered `duplicate` anyway. It survived the `runs` set of #527's run
  42785051498. A test on one SQLite store now fills the queue, then admits the same run: `duplicate`, not `full`. The
  test only; the store was right.
- **The Studio Server runs on newer patch releases of its sign-in libraries (4.7.3, refs #457)**: `jose@6.2.15` and
  `openid-client@6.8.9`, its versioned lock updated with them, and `@modelcontextprotocol/sdk@1.32.2`. For
  contributors, `vitest@5.1.0`, `@biomejs/biome@2.6.5` and `knip@6.44.1`, which found one unused export (`REALITY_UI`,
  no longer exported).
- **The release command judges every gate before it does anything (4.7.3, #471)**: `npm run release -- <x.y.z>` prints
  one line per gate – the preflight, main's `ci` on the release commit, the docs' human gates on its tree, its
  candidate, and what `ship tag` checks itself (the CHANGELOG section at that commit, the previous stable tag an
  ancestor, immutable releases on) – then refuses, naming every red gate, before it starts a candidate or tags
  anything. A gate still running (a candidate, main's `ci`) is waited for as before, and said so. When the release
  commit's candidate is missing, or was cancelled by a later candidate of the version, the report names that later
  commit and its run, and prints the command with the SHA in full. `--dry-run` prints the same report and does
  nothing else; its exit status is the verdict. 4.7.2 met these gates one at a time, each after a command had started.
- **A pull request that touches a connector or the Bridge plays the connectors from their archive (4.7.3, #471)**:
  the `connectors` job runs `connector-archive-e2e` on the archives it has just packed – the four connectors against
  a Bridge from its own archive, a fake IMAP server included, about ten seconds. Until now only the candidate ran it,
  so #459 and #460 (the email connector's UIDPLUS and `UID EXPUNGE`, the Bridge's `limits.pairingsPerAddress`) were
  merged green and 4.7.2's first candidate failed on them. The candidate still runs it on the archives it ships. The
  plan now opens the `reality` gate for `scripts/connector-archive-e2e.mjs`, `scripts/npm-install.mjs`,
  `scripts/lib/archive-harness.mjs` and `scripts/pack.mjs`, which fell to rules that did not: #466, the script's own
  fix, ran no connectors job.
- **The release command never re-runs a mutation verdict (4.7.3, #471)**: a mutation shard red on survivors that
  `docs/dev/mutants.json` does not name fails the same way on every try, yet `npm run release -- <x.y.z>` re-ran the
  candidate once anyway. 4.7.2's candidate 42527046788 spent 72 minutes failing the same six shards again, and the
  eleven survivors had to be dug out of the job logs. Such a shard now writes a `mutation verdict` annotation (a step
  of `candidate.yml` after the mutation step, from the shard's report – not `tools/mutate.ts`, whose change would
  throw away every cached shard), and the command stops at the first one, the run still going, never re-running the
  candidate, whatever else is red beside it. It lists each red shard and its survivors (`file:line operator: from →
  to`), the other red jobs, how to kill or name a survivor, and the command once the fix is merged
  (`--commit=<the fix's merge sha> --start-candidate`). The gate report says it first on the candidate's line, so
  `--dry-run` shows it before anything waits. A mutation job that died otherwise (cancelled, timed out, a runner lost)
  writes no verdict and keeps its one re-run.
- **The release checks run the unit suite once (4.7.3, #506)**: `release-check` and `release-check:ci` ran `build`,
  whose `check` ran `tsc` and the unit suite (`test:node`) again before `test:coverage` ran the same files under
  coverage. They now run `npm run game && … && npm run build:game`: `quality` already runs `tsc` on both configs, and
  `test:coverage` runs every file `test:node` ran. The candidate saves one pass of the unit suite and one of `tsc`.
- **The heavy test files are listed in one exclusion script (4.7.3, #506)**: `test:coverage` is now
  `npm run test:unit -- --coverage` and `test:node` is `npm run test:unit -- --exclude …` with its three asset files,
  so a new heavy file goes in `test:unit` and `test:heavy`, not four places. Arguments after `--` (CI's `--shard`,
  reporters, `--outputFile…`) still reach Vitest.
- **A smaller engine package (4.7.3, #514)**: `@quest-n-click/engine` no longer carries the repository's CI tools
  (test shards, mutation testing, the nightly report, the coverage ratchet, benches), 14 files that nothing in the
  package imported and some of which could not run from it. No `quest-n-click` command changes.
- **The local Studio answers a request body the same way on every route (4.7.3, #513)**: the API, the Assistant and
  the Assets tab share one body reader, each with its own size bound (8, 4 and 96 MiB). An empty or blank body is `{}`,
  a body that is not JSON is `400 the body is not valid JSON`, and anything but a JSON object is `400 the body must be
  a JSON object`. Before, the Assistant refused a blank body and called invalid JSON "not an object", and the API let a
  JSON array through to the route.
- **The nightly skips a night on a commit it already tested (4.7.3, #519)**: a scheduled run whose commit is the one the
  last completed scheduled run tested (green or red, not cancelled) skips every job and stays green, and its summary
  says "same commit as run <id> (<conclusion>): nothing to re-test". From 27 October to 8 November 2026, 7 of the 13
  nights did that (0da4745 five nights in a row, red each time, #395 commented each time), about 750 runner-minutes
  each. The report is skipped with it, so an open `nightly-red` issue stays open and gets no new comment. The `guard`
  job reads the previous runs with `actions: read`; when it cannot, the night runs. A run by hand always runs:
  `gh workflow run nightly --ref main`.
- **The CI installs Node and the dependencies through one local action (4.7.3, #524)**: 46 jobs of `ci.yml`,
  `candidate.yml`, `nightly.yml`, `release.yml`, `qualify.yml`, `docs-publish.yml`, `mutation.yml` and `prove.yml`
  each pasted the same setup-node block and `npm ci` retry loop. They now call `.github/actions/setup`, which runs
  setup-node with the npm cache, then `npm ci` three times, 15 s apart, each attempt bounded on Linux by its `timeout`
  input (minutes, 6 by default, 0 for none) and unbounded on macOS and Windows as before; `safe-directory: true` tells
  git the checkout is safe in the Playwright container jobs. Every job keeps its own per-attempt and step limits.
  `tests/ci-retry.test.ts` checks the action's loop, runs its script against stand-ins, and fails when a job runs
  `npm ci` without it; a change to `.github/actions/` runs every CI job. The mutation jobs keep their loop for now.
- **The weekly `prove` workflow is gone; the strict playtests run every night (4.7.3, #518)**: `prove.yml` was cancelled
  on its 60-minute timeout five Sundays of six, always in the bench, and had no report job, so nobody saw it; the one
  green run took 59 minutes and its bench was not even kept on a timeout. Its three steps: `prove:game` already runs
  on every push to `main` and in the candidate; `playtests -- --strict` now runs in the nightly's `worker-container`
  job (seconds), so a diverged session opens a `nightly-red` issue instead of waiting for a release; the bench stays a
  command run by hand (`npm run bench -- --rooms=100 --prove`), run by no workflow.
- **One `npm ci` timeout for every job (4.7.3, #531)**: each attempt of the setup action's install has 3 minutes on
  Linux, in a 10-minute step, wherever it runs; it was 3, 4 or 6 minutes, each derived from the step's old limit. An
  install takes 10 to 17 s with the cache, so a stalled attempt is now cut sooner and the next one starts.
  `external-consumer` keeps no timeout: its own registry retries wait longer.
- **The candidate moves a game from the previous release to its own archives (4.7.3, #534)**: `external-consumer` on
  Ubuntu Node 22 (Postgres), macOS and Windows now creates its game on the newest release older than the candidate
  (`--from=previous`, resolved at run time and checked against that release's sums), where it used 4.1.17, 4.1.16 and
  the pre-release 4.1.18-rc.1 since 4.1.19; Ubuntu Node 24 keeps 4.1.17 as the long path. `upgrade-check` and
  `external-consumer` share one resolver (`previousRelease` in `scripts/upgrade-source.mjs`).
- **A job the plan spares is skipped, not run to say "not needed" (4.7.3, #529)**: the ruleset on `main` requires
  `pr-gate` alone, so the sixteen gated jobs of `ci.yml` read their gate in a job-level `if:`, as `external-consumer`
  already did. A pull request's checks now list a spared job as skipped instead of green with a "not needed by the
  plan" step: no runner is asked for, no Playwright image pulled. The 157 per-step `env.RUN` conditions, the sixteen
  notice steps and the images chosen by the plan are gone. `pr-gate` accepts a gated job's skip only when its gate is
  false; a skip with the gate true, a failure or a cancellation stays red, and `pwa-firefox` stays a warning when it
  ran (#257). `unit` and `coverage` are unchanged: their gate chooses coverage or not, it never skips the suite.
- **A red night says how to re-run it by hand (4.7.3, #538)**: since #519 the following scheduled nights on the same
  commit are skipped, so a night red for an outside reason (a network error, a runner problem) stays red until a new
  commit lands. The `nightly-red` issue's text for a red scheduled night, and the guard's summary of a night skipped
  after a red one, now say so in the same words, with the command: `gh workflow run nightly --ref main`.
- **The setup action's `npm ci` waits out a registry hiccup (4.7.3, #539)**: `.github/actions/setup` runs
  `node scripts/npm-install.mjs ci`, the retry the archive scripts already used (#471): tried again only on a registry
  error a later try can pass (a 404 on a tarball, ETARGET, the network, a 5xx or a 429) or an attempt over its 3
  minutes, four times at most, 30, 60 then 120 s apart, `--prefer-online` after the first. A peer conflict or a failed
  build script fails at once instead of three times. Each attempt is bounded on Linux and macOS (not on Windows), and
  every step that calls the action has 17 minutes instead of 10: 4 × 3 min + 3.5 min of pauses, and a minute to spare.
- **The release resets the first-visit budget (4.7.3)**: `npm run release -- prepare`'s `quality baseline` step now
  writes the measured game's `assetBudgets.initialJsKB` back to the first visit it just measured plus 2 KB, rounded up
  to the KB – down too when the visit shrank – and prints the old and the new budget for the release pull request. The
  policy was written in the demo's comment but never automated: the demo's margin had shrunk to 221 bytes. A game that
  sets no budget is left alone, and a budget it cannot rewrite in place stops the step. The reference chapter, which
  `prepare` does not measure, is set by hand to 147 for 148 056 bytes measured.
- **The mutation jobs are written once (4.7.3, #525)**: ci, the candidate and the nightly each call
  `.github/workflows/mutation-run.yml` from one job named `mutation`, instead of three copies of the plan, the shards
  and the merge. Their checks now read `mutation / plan`, `mutation / mutation (<set>-<i>of<n>)` and
  `mutation / merge`; `pr-gate`, `candidate-gate` and the nightly's `report` need the one `mutation` job, red when the
  plan, a shard or the merge is. The safeguards are the same: a shard missing or doubled is refused at the merge, the
  candidate's shards say their verdict for the release command, and the nightly saves under the keys the candidate
  restores. The list of sets measured every night without gating (`MEASURED`), empty since 4.7.0, is gone with
  `--matrix=nightly`; a new set is measured by hand (`gh workflow run mutation -f set=…`) until it is read and gated.
  Editing `tools/mutation-sets.ts` and `tools/mutation-shards.ts`, two inputs of every set's hash, makes the first
  candidate after the merge run every shard cold, unless a nightly or a warm-up ran in between.
