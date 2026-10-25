# CI explained

What GitHub Actions runs on the engine repository, why a job ran or said "not needed by the plan", and what to do when
one is red. The workflows are in [`.github/workflows/`](../../.github/workflows/ci.yml); the plan that decides what a
pull request runs is [`tools/ci-plan.ts`](../../tools/ci-plan.ts). Which test suite runs in which job is
[Which tests run when](contribute.which-tests.md).

<a name="workflows"></a>

## The workflows

| Workflow | Starts on | Does | Gates |
|---|---|---|---|
| `ci` | a pull request; a push to `main`; by hand. A tag runs none (4.5.3, #291): its commit is one of `main`'s, already run | the three tiers below | the pull request (`pr-gate`); a release (`main`'s run on the tag's SHA must be green) |
| `candidate` | the release pull request's merge: a push to `main` that moves `package.json`'s version (4.5.4); by hand on `main` for a SHA (`gh workflow run candidate --ref main -f sha=<full sha>`); a pull request labelled `full-ci` (information only) | the release's only test pass since 4.5.3: `release-check:ci` and every heavy family on one exact SHA (the mutation sets read the cache the nightly fills), then `candidate-gate`, which writes and attests `candidate-manifest.json` | a tag must name one green run of it, started on `main` ([Releasing](contribute.releasing.md)) |
| `release` | the push of a `v*` tag (4.5.3, #291) | no test of its own: the commit on `main`'s first parents, `main`'s `ci` green on that SHA, the previous stable tag an ancestor, the candidate the tag names green on that SHA with every file of its manifest; then the release made from those files, `ship verify`, `npm-stage` (the npm packages staged for an owner to approve), `docs-publish` (4.5.0) and the website's revalidation | publication |
| `nightly` | every day at 03:17 UTC; by hand (`-f jobs=mutation`: the mutation jobs only, a warm-up of the cache below, which `release -- prepare` starts when it pushes the release pull request, 4.5.5, #331) | npm names, the heavy suite, the connectors' fuzz (a minute each), the abstraction corpus (500 seeds, four shards), every mutation set from scratch (each passed shard saved in the cache the candidate reads, 4.5.5), the Bridge's loads on SQLite and Postgres, the proof matrix, cross-runtime with 500 Remix seeds, the worker in a container | nothing directly; a red night is a bug to fix before the next release |
| `prove` | every Monday at 04:00 UTC; by hand (`game`, `rooms`) | `prove:game`, the committed playtests (`--strict`), and the bench on a 100-room generated game (uploaded as `bench`) | never a gate |
| `mutation` | by hand: `gh workflow run mutation --ref main -f set=<set> -f ref=<branch or SHA> [-f file=<path>]` | one mutation set, measured on a runner, its report kept as an artifact | nothing |
| `qualify` | a pull request or a push to `main` touching `ops/`, `scripts/ops-qualify*`, `scripts/pack.mjs`, `bridge/`, `package.json` or the lockfile; by hand | `npm run ops:qualify`: the Bridge's qualification profile on Docker | the profile does not rot between candidates |
| `docs-publish` | called by `release` after `ship verify`; by hand (`revision`, `rollback`, `promote`, `preview`) | the wiki and the publication record (4.5.0) | publication of the documentation |

**Which run a newer push cancels** (4.5.5, #337, #345). On a pull request and on `main`, `ci` and `qualify` run one at
a time: a newer push cancels the run it supersedes. A release commit's `ci` run on `main` is never cancelled: it runs
in a group of its own SHA, since its tag needs `main`'s `ci` run on that very SHA (before, a merge right after the
release pull request's cancelled it, and `ship tag` re-ran it). A release commit is told by its message: the merge of
`release/<x.y.z>` ("Merge pull request #N from <owner>/release/<x.y.z>"), or the subject `prepare` writes
("<x.y.z>: the release (prepared by npm run release -- prepare)"), which a squash's message lists and a rebase keeps.
Every other `main` commit shares one group: for a while each kept its own run, and four merges in a row queued four
full runs that starved the pull requests of runners. A run started by hand has a group of its own and cancels
nothing; `candidate`, `release` and `docs-publish` never cancel a run either.

<a name="tiers"></a>
<!-- applies: .. since 4.1.9 -->

## The three tiers of `ci`

**The fast tier, on every change.** `plan` reads the diff; `check` and `coverage` run beside it:

- `check`: on a pull request, `changes -- --check` (the fragment, [Conventions](contribute.conventions.md#changes-fragments))
  and `field:carry -- --check-range` (no carried pass changes its trust root); then `quality` (format, lint, knip,
  both TypeScript configurations, content lint), `docs:truth`, ffmpeg, `build:game` (the sample game's gates, the
  bundle, `verify:dist`, the spoiler check, the asset audit), `weight -- --release`, `quality:baseline -- --check
  --dist`, `prove:game`, `audit:deps` when `package.json` or the lockfile moved, then the two-entry build (game and
  Studio demo) that the e2e rows play, kept as the `dist` artifact.
- `unit` (four shards at once) and `coverage`: the unit suite and the asset tests, on every change, split in four
  (`--shard=<i>/4`, 4.5.4). The split follows each file's recorded duration, not the number of files (4.5.5, #349,
  [below](#shards)). When the change touches product code (the plan's `coverage` gate: the engine, a game, the
  Bridge, the Studio and its server, the CLI and packages, the golden saves, the authoring tools), each shard runs
  under V8 coverage and keeps a blob report; `coverage` merges the four (`test:merge`: the floors of `vite.config.ts`
  on the whole suite), then runs the ratchet: a warning on a pull request, a failure on `main`
  ([The coverage ratchet](contribute.coverage-ratchet.md)). Otherwise (the docs, a workflow, the release and wiki
  tools, tests alone) the shards run the same files without coverage (`test:unit`). Either way `coverage`, the check
  the ruleset requires, is red when a shard is not green.

**The second tier, what the change can break.** Each job needs `plan` (most also `check`) and reads its gate in the
plan: it runs its real work, or one step that says "not needed by the plan" and succeeds.

| Job | Gate | Runs |
|---|---|---|
| `unit` (four shards), `coverage` | `coverage` | the shards under coverage, merged, then the ratchet (spared: the same shards without coverage) |
| `node-24` | `node24` | the unit suite on Node 24 |
| `windows` | `windows` | the doctor, the type checks, the unit suite without the files that assume POSIX, `build:game`, the production server answering |
| `e2e` (six rows) | `e2e` | the production build played by touch: Chromium full, WebKit generic, Chromium and WebKit at the keyboard, Chromium in French, Chromium with the Canvas painter; with weight, music, visual, perf, Studio, accessibility and PWA steps on some rows |
| `pwa-firefox` | `pwaFirefox` | the PWA scenario in Firefox (install, update, interrupted update, reinstall, offline) |
| `reference` (Chromium, WebKit), `reference-fr`, `heroes` | `reference` | the reference chapter built, proved, played at the keyboard, against its visual references, at 30 fps or more with the CPU slowed 4×; `reference-fr` plays it in French and with the generic verbs; `heroes` builds, proves and plays the `heroes` example |
| `second-game` | `secondGame` | a game made by `npm run new-game`, through every gate the sample passes |
| `fresh-install` | `freshInstall` | the engine packed, a game created outside the repository, installed, built and played |
| `external-consumer` (Ubuntu, macOS, Windows) | `freshInstall` | the archives installed outside the repository on three systems |
| `upgrade` | `upgrade` | a game of the previous release moved to this engine, its old save played to the end |
| `reality-xcheck`, `connectors`, `bridge-postgres`, `reality` (Chromium, WebKit) | `reality` | Biscuit's samples in JavaScript and Rust, the connectors against a real Bridge with their fuzz, the Bridge on Postgres 16, the signals game end to end |
| `studio-hosted` | `studioHosted` | the Studio Server on Postgres and S3 (SeaweedFS) with a real Keycloak, then the hosted Studio in Chromium and Firefox |
| `cross-runtime` | none (every change) | the same canonical text, speedrun proofs and Remix worlds in Node, Chromium, WebKit and Firefox |

**The third tier, off the pull request path**: the mutation sets on a pull request labelled `full-ci` (`ci` runs
them nowhere else), the nightly, and the candidate, the release's only test pass. `release` tests nothing again: it
checks that `main`'s `ci` and the candidate were green on the tag's SHA.

**`pr-gate`** reads every job's result: each must be `success`; the mutation jobs may be `skipped` where they do not
run; `pwa-firefox`, flaky until #257 is fixed, is said as a warning and does not fail it (4.5.4). It is the one check
that sums a pull request up.

No job deploys GitHub Pages any more (4.5.2, see [the site](#pages-only)).

<a name="shards"></a>
<!-- applies: 4.5.5.. since 4.5.5 -->

## The unit shards by duration

Vitest's own `--shard` gives each shard the same number of files, in the order of a hash of their paths, whatever
they cost: in 4.5.4 the fourth shard ran its tests in a minute and a half and the three others in three to four.
Since 4.5.5 the sequencer of `vite.config.ts` ([`tools/unit-shards.ts`](../../tools/unit-shards.ts)) splits by each
file's duration, recorded in [`tools/unit-durations.json`](../../tools/unit-durations.json). A shard's time is
counted as the larger of its longest file and its files' total over two (a runner works on about two and a half at
once): the longest file first, each to the shard it leaves the shortest. A shard that holds a file of three minutes
gets less beside it, since it cannot end before that file; inside a shard the longest file starts first. A file the
table does not know counts as the median, so a new test needs no update. Every shard computes the whole split from the same files and the same table: the four agree, and a shard run
on a laptop runs the same files as the job.

When the shards drift apart, refresh the table:

```sh
# in the engine repository
npm run test:unit -- --reporter=json --outputFile=.cache/unit.json
npx tsx tools/unit-shards.ts --record .cache/unit.json   # several reports: each file's median
```

`tests/unit-shards.test.ts` checks that the table splits the suite into four shards within a tenth of each other's
time. The floor is the longest file: `checkpoint` and `compact` take two to three and a half minutes each.

<a name="the-plan"></a>
<!-- applies: .. since 4.1.9 -->

## The plan (`npm run ci:plan`)

```sh
# in the engine repository, on your branch
npm run ci:plan                    # against origin/main
npm run ci:plan -- --base=<ref>
npm run ci:plan -- --files=src/engine/dom/room.ts,games/demo/rooms/garden.ts
```

It prints, on stderr, one line per changed file with the rule that matched and the gates it opened, then the plan;
on stdout, one line of JSON (`{"auditDeps":…,"node24":…,…,"all":…,"docs":…,"docsPages":[…]}`), which
the `plan` job writes to its output. The first rule that matches a path wins, and a change runs the union of what its
files ask:

| A change to | Opens |
|---|---|
| `.github/workflows/ci.yml`, `tools/ci-plan.ts`, `package.json`, the lockfile, a shared configuration (`tsconfig*.json`, `vite.config.ts`, `vitest*.ts`, `biome.json`, `knip.json`, `requirements.txt`, `.nvmrc`, `.gitattributes`), the app shell, `tools/vite/` | everything |
| `docs/`, `changes/`, `wiki/`, any `.md`, `LICENSE*`, `.claude/`, `.cursor/`, `clevercloud/`, another `.github/` file | the fast tier only (`check`, and the unit suite without coverage) |
| the Reality runtime | `coverage`, `reality`, `e2e`, `node24`, `windows` |
| the painters, the music director | `coverage`, `e2e`, `reference`, `node24`, `windows` |
| the PWA and the storage (`boot.ts`, `dom/update`, `offline`, `save-store`, `storage`) | `coverage`, `e2e`, `pwaFirefox`, `upgrade`, `node24`, `windows` |
| any other file of `src/engine/` (the core) | everything |
| `src/studio/` | `coverage`, `e2e`, `studioHosted`, `node24`, `windows` |
| `bridge/` | `coverage`, `reality`, `freshInstall`, `node24`, `windows` (and `studioHosted` for its SQL layer) |
| `games/demo/` | `coverage`, `e2e`, `reference`, `node24`, `windows` |
| `games/reference/`, `games/heroes/` | `coverage`, `reference`, `node24` |
| `games/_template/`, `cli/`, `scripts/{pack,fresh-install,external-consumer,new-game}.mjs` | `coverage`, `secondGame`, `freshInstall`, `upgrade`, `node24`, `windows` |
| `studio-server/` | the authoring gates and `studioHosted` |
| `tools/wiki.ts` and `tools/wiki/` (but `docs`, `docs-load`, `glossary`, `manifest`, `page` and `site`, which the Studio and the MCP server read), `tools/release/`, the repository tools (`tools/mutate.ts`, `tools/changes.ts`, `tools/quality-baseline.ts`…, `scripts/release-notes.mjs`) | the fast tier only (4.5.4) |
| `scripts/ci-playwright-deps.sh` (Playwright's system packages on the runner, 4.5.5, #353) | `studioHosted` |
| `tools/studio/diff-rooms.ts` (the rooms the semantic diff draws, which the hosted Studio's captures use) | the authoring gates and `studioHosted` (4.5.5, #349: the rule below took it first until then) |
| other `tools/` and `scripts/` | the authoring gates (`coverage`, `node24`, `windows`, `secondGame`, `freshInstall`, `upgrade`, `reference`) |
| the hosted Studio's tests and its CI files (`tests/studio-{server,worker,collab,keycloak,client,diff-captures}.test.ts`, `ops/studio/{ci,keycloak}/`) | `studioHosted` |
| other `tests/` | the fast tier only (4.5.4) |
| a path no rule knows | everything |

A git error runs everything too: the plan never decides that it does not need to be checked. **`docs`** is true when
the change touches the documentation, its generators, or a file a wiki page rests on (a `sources` glob of
`wiki/manifest.json`); `docsPages` names those pages, to reread. It opens no job: the fast tier runs the doc tests on
every change.

<a name="full-ci"></a>

## Everything on a pull request: the `full-ci` label

On `main`, on a run started by hand and on a pull request labelled **`full-ci`**, the plan is `--all`: every gate opens. The label also
starts the mutation jobs of `ci`. Add the label, then push (it applies to `ci`'s next run). Adding the label also
starts a `candidate` run for information, once, on the pull request's head at that moment; a later push starts none:
remove the label and add it again to run it on the new head.

<a name="pages-only"></a>
<!-- applies: 4.5.2.. since 4.5.2 -->

## The site, outside `ci`

Since 4.5.2 the engine's `ci` deploys no GitHub Pages (D52). The project's website, `https://quest-n-click.cleverapps.io` (the repository
`Quest-n-Click/quest-n-click-site`), serves the demo at `/demo/` from the latest release's
`quest-n-click-v<version>-web.tar.gz` (built by the candidate under `BASE_PATH=/demo/`, summed and attested by the
release) and the latest documentation at `/docs/<page id>` (`/fr/docs/<page id>` in French); there is no versioned documentation online, a
version's documentation is its release's `quest-n-click-docs-<version>.tar.gz`. The website picks a release up by
itself (its `POST /api/revalidate`, hourly otherwise). The `pages` job and the `pages-only` runs that `docs-publish`
started (4.5.0 to 4.5.1) are gone.

> [!LIMIT id=pages-fail-closed]
> `npm run wiki -- pages`, which assembled the versioned `/docs/` for GitHub Pages up to 4.5.1, still takes the
> released archives only and fails when one cannot be downloaded or verified; no site deploys its output since 4.5.2.

<a name="job-failed"></a>

## A job failed on my pull request

<!-- step: read-plan -->
1. **Read the plan's summary** in the `plan` job (or run `npm run ci:plan` locally): it says why each job ran.

<!-- step: reproduce -->
2. **Reproduce locally**, in the engine repository, with the job's own command:

   | Red job | Run locally |
   |---|---|
   | `check` | the failing step: `npm run quality`, `npm run docs:truth`, `npm run build:game`, `npm run quality:baseline -- --check --dist` (after `npm run build:web`), `npm run prove:game`, `npm run changes -- --check` |
   | `unit (<i>)` | `npm run test:unit -- --shard=<i>/4` (the same files as the job: the split is the same on every machine) |
   | `coverage` | `npm run test:coverage` (a test, or a floor of `vite.config.ts` not met) |
   | `node-24` | `npm run test:node` under Node 24 |
   | `e2e`, `reference`, `second-game` | `npm run build:game`, `npm run preview -- --port 5173 &`, then the row's `npm run e2e -- http://127.0.0.1:5173/ --game demo --prod …` (`E2E_BROWSER=webkit` for a WebKit row) |
   | `fresh-install`, `external-consumer`, `upgrade` | `npm run fresh-install`, `npm run external-consumer`, `npm run upgrade-check -- --from=previous` |
   | `mutation (<set>)` | `npm run test:mutation:core -- --set=<set>` ([Mutation testing](contribute.mutation-testing.md)) |

   A failed e2e row uploads its screenshots as an artifact: read them first.

<!-- step: check-flake -->
3. **Check the known flakes below** before rerunning. A rerun of a red job that is not a known flake hides a bug.

<!-- step: fix -->
4. **Fix, push, read `pr-gate` again.**

<a name="known-flakes"></a>

## Known flakes and their handling

| Symptom | Where | What is done | Since |
|---|---|---|---|
| WebKit's `Context is stopped` (or `Cache API operation failed: Context is stopped`) after every check passed | `e2e:pwa` and `e2e` on WebKit, during the teardown | Reported as a warning ("reported, not counted"), only on WebKit, only in that exact form and only after every check passed; any other browser error still fails. Seen on #111, #118 (13 Oct 2026) and #139 (18 Oct 2026) | 4.1.20 (`e2e:pwa`), 4.2.1 (`e2e`) |
| The Firefox pass of `e2e:studio-hosted` timed out at step 6d (Prepare assets) | `studio-hosted` | A real bug (a late status poll overwrote the panel), fixed in 4.3.0 (#210). If it comes back, it is a regression, not a flake | fixed in 4.3.0 |
| `apt-get update` hangs for many minutes on the runner's Ubuntu mirror | every job that installs ffmpeg | `scripts/ci-ffmpeg.sh`: apt bounded to four minutes an attempt, then a static ffmpeg from GitHub's CDN (BtbN/FFmpeg-Builds); `release.yml` carries the same logic inline. Install steps have 20 minutes. Seen on 7 Oct 2026 | 4.1.15 |
| `toomanyrequests` pulling an image from Docker Hub | `bridge-postgres`, `mutation`, the nightly and the candidate's services | Images pulled from `mirror.gcr.io` at the same digest. Seen on two jobs on 9 Oct 2026 | 4.1.18 |
| `npm ci`, `pip install` or `playwright install --with-deps` fails on a network error, or stalls on a slow mirror | any job | Every install step is tried three times, 15 s apart. On Linux each attempt has its own limit (`timeout <n>m`, at most a third of the step's minutes), so an attempt that stalls is cut and the next one starts; the step's `timeout-minutes` leaves room for the three. The macOS and Windows jobs (`windows`, `external-consumer`) have the step's limit only: no `timeout` there. Seen on #338 (25 Oct 2026, apt at a few kB/s, the first attempt spent the whole step). apt itself is never under `timeout`: killing `playwright install --with-deps` left its apt-get holding the dpkg lock, and the retries failed at once (#350). Playwright's system packages go through `scripts/ci-playwright-deps.sh` (`install-deps`, three tries; apt fails by itself when the mirror sends nothing for a minute, and waits for a lock still held), then the browsers' download keeps its limit an attempt | 4.5.5 (#340, #353) |
| A unit test past vitest's 5 s in a loaded run, green alone | `unit`, `windows`, a local `npm test` | The cost cut where it is the fixture's: the scenario map imports the game folder once per state of its files, the wiki push copies one seeded repository and reads its tip without a clone. Where the processes are the test's own (real bash steps, git pushes, Python cuts, real-time walks, the whole wiki's bundle), the block sets its limit with a comment that says why; nothing is skipped. Seen on #311's `unit (3)` (25 Oct 2026, the scenario map) and locally (#356) | 4.5.5 (#356) |
| The Firefox room editor never answers after "Reload view" (`shown undefined`, then "the run did not end within 8 min") | `studio-hosted`, step 4b | Silent for 15 s: "Reload view" once more (a new document, which answers), said in the log, as step 6b does since #264. Seen on 24 Oct 2026 | 4.5.5 (#356) |
| WebKit's `<url> due to access control checks` on the cat's frames, every check passed | `e2e:pwa` WebKit | WebKit says it of any load in CORS mode that failed, one cut short included (the palette swap loads the frames with `crossOrigin`). Each such file is asked again offline the same way: drawn, a warning ("reported, not counted"); refused again, a failure. Seen on #305 (25 Oct 2026) | 4.5.5 (#356) |
| `e2e:a11y` stops on "neither a title button nor a running game exists" | `e2e` Chromium (keyboard) | The walkthrough read the title before it was drawn: it now waits up to 15 s for a title button or a running game. Seen on 25 Oct 2026 | 4.5.5 (#356) |
| WebKit cannot navigate offline under Playwright | `e2e:pwa` WebKit, `reality` WebKit | `--allow-skip`: that step reports "skipped", never counted as a proof; a person checks Safari offline before each release ([Field passes](contribute.field-passes.md)) | 3.1.1 |

> [!LIMIT id=windows-not-required]
> The `windows` job runs the unit suite without the files that assume POSIX; it is not a required check of the
> ruleset until the maintainer adds it.

<a name="related"></a>

## Related identifiers

- `npm run ci:plan`, the `full-ci` label, `pr-gate`; the `pages-only` input, gone in 4.5.2.
- [Which tests run when](contribute.which-tests.md), [Before a pull request](contribute.before-a-pr.md),
  [Releasing](contribute.releasing.md), [Mutation testing](contribute.mutation-testing.md).
