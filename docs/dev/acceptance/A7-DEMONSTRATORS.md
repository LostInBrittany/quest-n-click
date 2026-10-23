# A7: the three demonstrators, run through the chain

> **Status**: run locally on 23 October 2026 by claude-a7, from the commit `779ddb3c742825f3f1517aad645ced8653c12a35`
> (branch `feature/450-a7-demonstrators`: A5b, A6 merged, the five pages, two fixes the chain found). Nothing was
> published and no GitHub resource was touched. **Plan**: `docs/dev/PLAN-4.5-WIKI.md` §13. Outputs are trimmed; the
> full logs were in `/tmp/a7chain/`, and the whole run is one script, `docs/dev/acceptance/a7-chain.sh` (§8).

## 1. What was written

| Page | State | FR / EN | What it proves |
|---|---|---|---|
| `clever.restore-drill` (D1) | ready | « Exercice de restauration sur une installation vierge » / "Restore the Studio on a fresh installation" | the ten headings, six step ids identical in both languages, a `studio-config` block the real `loadConfig` accepts, `[!MEASURE id=restore-time]`, `[!GUARANTEE id=restore-empty-db-only]` and its claim, `[!LIMIT id=rpo]`, `[!LIMIT id=no-going-back-after-migrations]`, "not verified on a live installation" said plainly |
| `reference.environment-variables` (D2) | ready | « Variables d'environnement » / "Environment variables" | generated from `wiki/data/env.json` (93 variables, 8 groups, two dynamic reads resolved) and the code; one section per variable; `identifiers` = the 93 names |
| `team.write-refused-423` (D3) | ready | titles naming the hosted Studio (A6's finding) | symptoms, causes (a lease held by another member, 120 s, renewed every 30 s while their Studio stays open; an owner's exclusive lease; your own lease ended), diagnosis, four fix steps (wait, ask, owner takeover, exclusive lease), check, neighbours |
| `team.write-refused-409` (D3's neighbour) | ready | idem | a stale base revision (`x-studio-base`), the dialog's three answers, the Bridge's 409 told apart |
| `bridge.troubleshooting` (D3's counter-example) | ready | « Dépannage du Bridge et des connecteurs » | sections `conflict-409`, `unavailable-503`, `same-event-twice`, `connector-down`, from the code |

Sources read for the content: `docs/en|fr/STUDIO-SERVER.md`, `docs/dev/QUALIF-4.2.3-REFERENCE.md` §1–§4,
`studio-server/src/ops/backup.ts`, `ship.ts`, `journal.ts`, `server/main.ts`, `config.ts`, `leases.ts`, `http.ts`,
`src/studio/spans.ts` and `hosted.ts` (the dialogs' exact words), `bridge/src/bridge.ts`, `server.ts`, `runs.ts`,
`connectors/src/run.ts` and `email/connector.ts`, `ops/studio/*`, `clevercloud/cron.json`.

Choices worth a second look:

- **The measure.** QUALIF-4.2.3 §4 holds two samples: 28.7 s (phase A, backup at revision 1, 508 rows) and 59.7 s
  (phase B, backup at revision 63, 593 rows, 2 operations replayed). The page gives both. Its `version` is 4.2.2: the
  engine ran at `52e68932` then `c66fbf56`, on main before the 4.2.3 tag, and `package.json` said 4.2.2; the
  conditions say so. The source is pinned to `edb8d39a03a3ad6ba9aa8f33e1ab5473d3d7a34e`, the commit that wrote the
  phase B figures (§4 is unchanged since; `d91aa356` held phase A's only).
- **The guarantee was narrowed to what the test proves.** The test (`tests/studio-backup.test.ts › the Studio Server's
  backup › refuses a backup altered, a project not empty, a blob missing, another schema`) calls `restoreInto` on a
  project that holds rows and expects `/not empty/`, on SQLite. It does not assert that nothing was written, nor try a
  database with a row in one table only. So the guarantee says "a restore into a database that already holds a project
  is refused", and the plain text after it says, citing `backup.ts`, that the check runs inside the restore's
  transaction before the first row. The scope review (`npm run wiki -- review-claim restore-empty-db-only --by
  claude-a7`) was recorded after that comparison; **the maintainer should confirm or reset it.**
- **The Bridge's 409.** A6's test fixture said a Bridge 409 meant a duplicate signal. The code answers 200 with
  `duplicate` for that, and 409 for a pairing code confirmed twice, a speedrun run sent twice, or a moderation of a run
  the worker did not find valid. The page says the code's version. `bridge.troubleshooting` was made `ready` with four
  sections rather than a single 409 section, because a `ready` page turns the acceptance questions `event-twice` and
  `connector-down` from pending to graded: they are answered there (both hits).
- **Coverage.** No row of `wiki/coverage.json` is marked `migrated`: each of the eight rows these pages take from is
  split with other pages still planned (`clever.backups`, `team.day-to-day`, `team.recovery`,
  `bridge.backup-restore`). The limit candidates carried into a `[!LIMIT]`, the guarantee or an error table are ticked
  `reported` (12).
- **Translations.** The 133 section pairs of the five pages were acknowledged by claude-a7, who wrote both sides. That
  is the author's own reading, not a second one: **the maintainer's review stands in for it at the stop.**
- **`CONTENT_GUIDE`'s alias** (A6's suggestion) waits for the page that replaces CONTENT_GUIDE, in phase B.

## 2. D1 and the claim: `check`, then `check --publish`

```text
$ npm run wiki -- check
·  clever.restore-drill: the claim restore-empty-db-only is referenced, not executed (no test report given (--test-report))
·  claim restore-empty-db-only (clever.restore-drill): referenced · scope reviewed
✔  wiki (work level): 213 pages consistent, 0 warning(s), 0 link(s) to planned pages        (exit 0)

$ npx vitest run tests/studio-backup.test.ts --reporter=default --reporter=json --outputFile.json=/tmp/a7chain/report/vitest.json
      Tests  10 passed (10)
# beside it, commit.json: {"format":"quest-n-click-test-report","version":1,"commit":"779ddb3c…","root":"<the worktree>","run":…}

$ npm run wiki -- check --publish --product-ref HEAD --state candidate --candidate local-a7 --test-report /tmp/a7chain/report/vitest.json
✖  --test-report /tmp/a7chain/report/commit.json: run: Invalid string: must match pattern /^\d+$/
✖  clever.restore-drill: the claim restore-empty-db-only is not executed: no test report given (--test-report)
✖  wiki (publication level): 2 error(s)                                                       (exit 1)
```

`--candidate local-a7` is refused as the plan's wording had it: a candidate is a GitHub run id, digits only, and
`commit.json`'s `run` must be that id. The run was made again with the placeholder run id `0`:

```text
$ npm run wiki -- check --publish --product-ref HEAD --state candidate --candidate 0 --test-report /tmp/a7chain/report/vitest.json
·  claim restore-empty-db-only (clever.restore-drill): referenced · executed on 779ddb3c7428 · scope reviewed
✔  wiki (publication level): 213 pages consistent, 0 warning(s), 0 link(s) to planned pages   (exit 0)

$ … the same, without --test-report
✖  clever.restore-drill: the claim restore-empty-db-only is not executed: no test report given (--test-report)   (exit 1)

$ … --state published (implies --released)
✖  reference.environment-variables: applies from 4.5.0, after the released product 4.4.0        (exit 1)
```

**A local report proves nothing about provenance** (§4.4.3): this `vitest.json` and its `commit.json` were written
here, by hand, and anyone can write the same two files. "Executed" means only that a report naming this commit says
the test passed. In the real chain, `docs-publish` downloads `candidate-test-report` from the attested candidate run
`--candidate` names (`.github/workflows/docs-publish.yml`), and that is what binds the report to a run. The last
refusal is expected before 4.5.0 exists: the variable reference applies from 4.5.0 and `package.json` still says 4.4.0.

The `studio-config` block of D1 is run through `loadConfig` by the same `check` (an error would be listed; none is).

## 3. D2: the register, the bundle, the package, MCP from a project outside the repository

```text
$ npm run wiki -- env
✔  93 variable(s), 2 dynamic read(s) resolved: en/reference.environment-variables.md, fr/reference.environment-variables.md; manifest identifiers unchanged

$ npm run wiki -- bundle --out /tmp/a7chain/bundle        (twice, compared with diff -r)
✔  documentation bundle of 4.4.0 (doc revision 779ddb3c7428): 19 file(s), 10 page file(s), 489308 bytes
two bundles: identical bytes

$ node scripts/pack.mjs --out=/tmp/a7chain/pack --build-id local-a7
packed into /tmp/a7chain/pack: quest-n-click 4.4.0 (589 files and its docs-bundle/), …       (exit 0)
$ tar -tzf quest-n-click-4.4.0.tgz | grep docs-bundle     → 20 entries: bundle-manifest.json, index.json,
  md/en|fr/ × 5 pages, legacy/ × 8
# every file checked against bundle-manifest.json after extraction:
{"productVersion": "4.4.0", "productCommit": "779ddb3c…", "docRevision": "779ddb3c…", "buildId": "local-a7", …}
19 files in bundle-manifest.json, sha256 mismatches: []
```

`wiki -- check` fails when the code reads a variable the register does not describe, when a described `code` variable
is read nowhere, or when a computed read (`process.env[name]`) is not resolved; `tests/wiki-env.test.ts` covers each,
and resolves `takeSecrets`' computed reads through a recording environment, so the register's resolution is exactly
what the code reads.

Then, in `/tmp/a7chain/consumer` (outside the repository): `create.mjs keeper "The Keeper"
--engine=file:…/quest-n-click-4.4.0.tgz`, `npm install` (417 packages), and a stdio client of the MCP SDK the engine
depends on, against `node_modules/quest-n-click/cli/quest-n-click.mjs mcp`:

```text
search_docs {query:"STUDIO_SESSION_KEY"}
  1. reference.environment-variables#studio-session-key  reason identifier  score 36  "**STUDIO**_**SESSION**_**KEY**"
  2. clever.restore-drill#steps                          reason title       score 12.8
  3. team.write-refused-409#causes                       reason title       score 12

read_doc {id:"reference.environment-variables", section:"studio-session-key", lang:"fr"}
  > quest'n'click documentation · reference.environment-variables#studio-session-key (fr, ready) · quest'n'click 4.4.0
    (commit 779ddb3c7428, doc revision 779ddb3c7428, build local-a7) · bundle built for quest'n'click 4.4.0, build
    local-a7; whether it was promoted to a release is checked at https://wanoo.github.io/quest-n-click/docs/publication.json, never in the bundle
  ### `STUDIO_SESSION_KEY`
  Les clés qui scellent les cookies de session des membres : une clé, ou plusieurs séparées par des virgules, …
  - Origine : vous la posez ; le code la lit.
  - Secret : oui, lue une fois au démarrage, puis retirée de l'environnement ; jamais journalisée.
  - Depuis un fichier : `STUDIO_SESSION_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
  structuredContent.provenance: {source: bundle, productVersion: 4.4.0, productCommit: 779ddb3c…, docRevision: 779ddb3c…, buildId: local-a7}
  structuredContent.url: {versioned: https://wanoo.github.io/quest-n-click/docs/4.4.0/r1/fr/reference.environment-variables.html#studio-session-key,
                          current: https://github.com/wanoo/quest-n-click/wiki/FR-Reference-Variables-D-Environnement#studio-session-key,
                          currentLabel: "current documentation (the latest release), not necessarily this version"}

read_doc {name:"TOOLS"} (the legacy call)
  isError false · 1 block · text · 59 907 characters · no structuredContent · 8 "##" headings
  sha256 1a33644080f929fc28633fdef09a250e3eee90e967c62facab596e1afec6d117 = sha256 of docs/en/TOOLS.md in the repository

list_docs → 5 pages, all ready (a package never carries a draft)
```

**What the chain found in D2, and what was fixed before this run** (both in this branch, each with a test that fails
without its fix):

1. The first run gave the right section for `STUDIO_SESSION_KEY` with the excerpt `**STUDIO**`, and ranked the
   variable page second for "How do I restore the Studio on an empty database?" with the reason "identifier": the
   variable `STUDIO` (read by `vite.config.ts`) counted as a whole identifier in any query with the word "studio". An
   identifier written in capitals now counts only when the query holds it exactly; the longest whole identifier is the
   one an excerpt shows; and an excerpt drops the page's own `**` before marking the words (it read `****423**`).
   Now the restore question gives `clever.restore-drill` first and the variable page second through its section's
   heading (`STUDIO_DATABASE_URL`), not through an identifier.
2. The provenance from the package had no `url.versioned` nor `url.current` (§4.5.4, §13 D2). `read_doc {id}` now
   gives both for a bundle: Pages' permalink with the revision (`r1` for a package, the release's own), and the wiki's
   page, labelled current. A repository preview gives neither.

## 4. D3: the 423, its 409 neighbour, the Bridge's 409, from the same installed package

```text
search_docs {query:"423", lang:"en"}  1. team.write-refused-423  title  "Write refused on the hosted Studio: span locked (**423**)"
                                      2. team.write-refused-409#neighbours  body  score 3
search_docs {query:"423", lang:"fr"}  1. team.write-refused-423  title  "Écriture refusée sur le Studio hébergé : pan verrouillé (**423**)"
search_docs {query:"409", context:"studio-hosted"}
                                      1. team.write-refused-409  title  "Write refused on the hosted Studio: stale base revision (**409**)"
                                      2. team.write-refused-423#neighbours  body  score 3
search_docs {query:"409"} (no context)
                                      1. team.write-refused-409             title     "… hosted Studio: stale base revision (**409**)"   context studio-hosted
                                      2. bridge.troubleshooting#conflict-409 question "The Bridge answers **409**"                         context bridge
                                      3. team.write-refused-423#neighbours  body
search_docs {query:"conflit de verrou"}
                                      1. team.write-refused-423#fix  alias  score 35.4  "**conflit** de **verrou**"
                                      2. team.write-refused-409#neighbours  alias  score 8
                                      3. bridge.troubleshooting#unavailable-503  body  (the SQLite write lock)
```

Each acceptance item of §13 D3 holds: "423" puts the 423 page first in both languages; "409" with the hosted Studio's
context puts its page first; without a context both services appear, each excerpt naming its own; « conflit de verrou »
finds the 423 page (through its alias and the glossary's `verrou → bail → lease`). Level 2 ("a fresh sub-agent
answers 'I get a 423 in the Studio' with the right recovery") **was not run here**: it is the AI protocol's
(`docs/dev/acceptance/AI-PROTOCOL.md`), on the public preview, in C3.

## 5. The wiki artifact, the archive, the wiki's push, Pages

```text
$ npm run wiki -- build --target wiki --out /tmp/a7chain/wiki-build
✔  23 file(s) written                       (Home.md, _Footer.md, and in en/ and fr/: a _Sidebar.md, the 5 pages, the 4 indexes)

$ npm run wiki -- archive --out …/quest-n-click-docs-4.5.0.tar.gz --product-version 4.5.0 --build-id 0
✔  quest-n-click-docs-4.5.0.tar.gz: 65 files, 318855 bytes, sha256 20b792b4… (4.5.0 r1, doc revision 779ddb3c7428)
   also 4.5.0 r2 (bda381be…), 4.6.0 r1 (ef6aa8c4…), 4.5.0 r3 (b8757e7a…)
4.5.0 r1 archive built twice: identical bytes
✖  wrong-name.tar.gz: the archive of 4.5.0 r1 is named quest-n-click-docs-4.5.0.tar.gz
```

The archives say `--product-version 4.5.0` and `4.6.0` because `pages` serves only releases ≥ 4.5.0; they are local
fixtures of what a release would carry, built from this commit.

**The archive outside the repository, with its resources.** Extracted in `/tmp/a7chain/archive-x`: 65 files listed in
its `bundle-manifest.json`, every sha256 matching, nothing on disk that the manifest does not list; `html/` 24 (a page
per page and language, the four indexes, `index.html`, `search.js`, `search-index.json`, `style.css`, `sitemap.xml`,
`llms.txt`), `wiki/` 22, `md/` 10, `legacy/` 8, `index.json`. **No `assets/`: none of the five pages shows an image**,
so the image path of the archive was not exercised by this run.

**The wiki's push and the promotion, on a local bare repository** standing for `<repo>.wiki.git` (seeded with a
`Home.md`, as the maintainer's first page would), with no token and no key in the environment:

```text
$ wiki -- publish --target wiki --mode release --ref refs/heads/main --version 4.5.0 --revision r1 --tag v4.5.0 --archive quest-n-click-docs-4.5.0.tar.gz --sha256 20b792b4…
✔  4.5.0 r1 is the latest: pushed                                           wiki repo: 2 commits
$ … the same again as --mode promote
✔  4.5.0 r1 is already the latest: nothing changed                          wiki repo: 2 commits, same HEAD
publication.json byte-identical after the second decision
$ … --mode revision --ref refs/heads/docs/4.5.0 --revision r2 --tag docs-v4.5.0-r2
✔  4.5.0 r2 is the latest: pushed                                           3 commits
$ … --mode release --version 4.6.0 --revision r1 --tag v4.6.0
✔  4.6.0 r1 is the latest: pushed                                           4 commits
$ … --mode revision --version 4.5.0 --revision r3 --tag docs-v4.5.0-r3      (an older version's fix, after 4.6.0)
✔  4.5.0 r3 recorded for /docs/4.5.0/; the wiki and latest stay on 4.6.0 r1: pushed (the wiki pages are unchanged)
files changed by the 4.5.0 r3 publication: publication.json
$ … r2 with --sha256 0000…
✖  …-r2.tar.gz: sha256 bda381be…, not the verified 0000…                    (exit 1, nothing pushed)
$ … 4.5.0 r1 again, as a release
✖  4.5.0 r1 is older than its approved revision r3: refused (--rollback-to 4.5.0-r1 to go back on purpose)
$ … 4.6.0 from refs/heads/feature/x
✖  a release publishes from refs/heads/main, not from refs/heads/feature/x
the wiki repository's pages = the 4.6.0 r1 archive's wiki/, byte for byte (publication.json aside)
```

"Promotion changes no byte": the archive the record names is the file the candidate would have built (its sha256 is
the one passed with `--sha256` and recorded), the wiki receives that archive's `wiki/` as it is, and deciding the same
state twice changes neither the record nor the repository.

**Pages, from a fixture release set**, with `--skip-attestations`, **allowed only for this local trial** (the command
prints "never deploy this folder"; without `--repo` nor that flag it refuses):

```text
releases/v4.5.0/          quest-n-click-docs-4.5.0.tar.gz, v4.5.0-SHA256SUMS, quest-n-click-v4.5.0-candidate.json
releases/docs-v4.5.0-r2/  quest-n-click-docs-4.5.0-r2.tar.gz, docs-v4.5.0-r2-SHA256SUMS
releases/docs-v4.5.0-r3/  …-r3.tar.gz, its SHA256SUMS
releases/v4.6.0/          quest-n-click-docs-4.6.0.tar.gz, its SHA256SUMS, its candidate manifest
publication.json          the one the pushes above left (latest 4.6.0 r1; 4.5.0 approved r3)

$ npm run wiki -- pages --out /tmp/a7chain/site1 --releases releases --publication publication.json --skip-attestations
⚠  --skip-attestations: the archives are not authenticated; never deploy this folder
✔  /docs/: 156 files                                                         (exit 0)
$ … again into site2
two Pages builds from the same releases: identical trees
$ … without --skip-attestations and without --repo
✖  pages verifies each archive against --repo <owner/name> (or --skip-attestations, never to deploy)
/docs/4.5.0/r2/ = the r2 archive's html/, byte for byte
/docs/4.5.0/r1/ = the r1 archive's html/, byte for byte, after 4.6.0 was published
tree: 4.5.0/{en,fr,r1,r2,r3}  4.6.0/{en,fr,r1}  latest/{en,fr}  index.html  publication.json
```

Served by `python3 -m http.server` from `site1` and read with `curl`:

```text
GET /index.html                                         200
GET /4.5.0/r2/en/clever.restore-drill.html              200 17 713 B   (title "Restore the Studio on a fresh installation · quest'n'click 4.5.0")
GET /4.5.0/r1/fr/team.write-refused-423.html            200
GET /4.6.0/r1/fr/reference.environment-variables.html   200 48 220 B
GET /4.5.0/en/clever.restore-drill.html                 200   an alias page ("Alias · quest'n'click 4.5.0 r3") to ../../4.5.0/r3/…
GET /latest/en/team.write-refused-409.html              200   an alias, refresh to ../../4.6.0/r1/en/team.write-refused-409.html
GET /publication.json                                   200
GET /4.6.0/r1/search-index.json                         200
```

So, locally: r2 (and r3) and a plain rebuild of Pages keep every revision; an older version stays readable at its
permalinks after a newer one is published, and its alias follows its own latest fix, not the wiki.

**A gap the HTML shows.** The rendered D1 page says "Guarantee · restore-empty-db-only · referenced · scope reviewed",
never "executed". `wiki -- archive` takes no `--test-report`, and `candidate.yml` builds the archive (line 420) without
the candidate's report, so a published page will never show "executed", although `docs-publish` refuses to publish a
claim that was not executed. The plan (§4.4.3, "the build renders these blocks… their state comes from the manifest
and the candidate's reports") expects the published state to show it. **Not fixed here**: it changes the candidate's
job order (the archive would need `candidate-test-report` from `release-core`) and the archive's reproducibility check.
It is for the maintainer to decide before phase B (§13: the contract is fixed before phase B).

## 6. Acceptance (`npm run wiki -- acceptance`)

```text
questions        106 runs: 10 in the top 3, 0 missed, 96 pending · top 3: 100 % of those evaluated
counter-examples 14 runs: 2 with no inapplicable answer first, 0 failed, 12 pending · 100 %
empty results    0 among the runs evaluated, 0 justified · n/a
```

The hits: `error-423` (en, fr), `rotate-session-key` (en, fr, the variable page's section), `restore-empty-db`
(en, fr), `event-twice` and `connector-down` (en, fr, the Bridge's sections). The passes: `error-409-shared` (en, fr:
each context puts its service first, and without one both appear, each naming its service). `error-503-shared` stays
pending (`clever.troubleshooting` and `clever.redeploys` are not written).

A measure for phase B: **63 of the 108 pending runs already return a result**, not the explicit empty one, because
five pages are enough to pass the confidence threshold on loose words (a question about iPhone offline play gets the
Bridge's "connector down" first). Pending runs are not graded, so nothing fails, but the empty-result rate will only
mean something once the pages a question expects are written; A6 already noted that a two-word query matching one
word of a question passes the threshold.

## 7. The stop's list, item by item

| Item (§13) | Locally | State |
|---|---|---|
| D1 through the chain | §2, §5 | done; "verified on" **not filled**: the page says it was not replayed on a live installation |
| D2 through the chain | §3 | done, after two fixes the chain found |
| D3 through the chain | §4 | done (level 1); level 2 not run |
| The legacy reading works during the migration | §3: `read_doc {name:"TOOLS"}` from the package, one block, the bytes of `docs/en/TOOLS.md`; in the repository, `read_doc {name}` reads `docs/en/<NAME>.md` (tests/wiki-access.test.ts) | done |
| The archive installed outside the repository with its resources | §5 | done; no image in these pages, so `assets/` was not exercised |
| The candidate promoted without a changed byte | §5, on a local bare repository | done locally; the real push waits (below) |
| The publication started after `ship verify` (sandbox) | — | **waiting for the maintainer** |
| After a doc revision r2 and a plain Pages redeploy, r2 still online | §5, fixture release set | done locally |
| An old version still readable after a newer one | §5 | done locally |

**Waiting for the maintainer** (each needs GitHub or Clever Cloud, and this run touched neither):

1. **The real wiki push**: run `docs-publish` in `preview` mode (or a test page by hand, as the A1 spike planned) to
   check that `WIKI_DEPLOY_KEY` (or `GITHUB_TOKEN`) can push to `wanoo/quest-n-click.wiki.git`, that `en/` and `fr/`
   folders and the `<a name>` anchors survive GitHub's wiki, and that the section links click through.
2. **`docs-publish` after `ship verify`, in a sandbox**: a test tag on a sandbox repository (or `act`), checking that
   the job starts only after `ship verify` passed, downloads `candidate-test-report` from the attested candidate, and
   that `check --publish` there calls the D1 claim "executed on <sha>".
3. **The `docs-publish` environment**: create and protect it (required reviewers, branch policy main and `docs/*`),
   with `WIKI_DEPLOY_KEY` in it; and the recommended tag ruleset on `docs-v*`.
4. **Pages from real releases**: `npm run wiki -- pages --repo wanoo/quest-n-click`, with `gh attestation verify`, once
   a release ≥ 4.5.0 (or a preview) exists.
5. **A live restore drill** on the Clever apps of the 4.2.1 spike, if you agree to one: it would let D1 say "verified
   on <date>, <version>, by <who>" instead of "not verified".
6. **Reviews**: confirm or reset the claim's scope review (`restore-empty-db-only`, recorded by claude-a7) and read the
   133 translation pairs claude-a7 acknowledged as their author.
7. **Decide on the gap of §5** (the archive's HTML never shows "executed").

## 8. Replaying it

```sh
# in the engine repository, on this branch, committed (the publication level reads HEAD)
bash docs/dev/acceptance/a7-chain.sh /tmp/a7chain
```

The script runs the commands above in that order and writes everything to the folder it is given (emptied first):
the bundle, the pack, a created project `consumer/keeper` with its MCP client `a7-mcp.mjs`, the archives, a bare
`wikirepo/wiki.git`, the fixture `releases/`, two Pages trees, and one log per step (`01-check.txt` …
`14-acceptance.txt`). It needs no network beyond the created project's `npm install`, and no credential:
`GITHUB_TOKEN`, `GH_TOKEN` and `WIKI_DEPLOY_KEY` are unset for the pushes. It was replayed once into
`/tmp/a7chain-replay` with the same results. Port 8765 must be free (the local look at Pages).
