# Field proof: what only people and real devices can check

The machine checks a release on every push: the solver, the browsers in CI, the archive, the budgets. Seven checks
need a person or a real device. They are reported in each release's notes, not blocking (D12): a release says how
many were done (`docs/dev/passes/<version>.md`, from `docs/dev/passes/TEMPLATE.md`). This page is how to do each one
and what to bring back.

| # | Pass | How | Bring back |
|---|---|---|---|
| 1 | Screen reader | `docs/dev/SCREEN-READER.md`: VoiceOver on iOS or TalkBack on Android, a game from the title to the first puzzle solved | the sheet's row: device, OS, what could not be reached or was not read |
| 2 | Safari offline | `docs/dev/SAFARI-OFFLINE.md`: first visit online, airplane mode, a room never visited, a reload | the row: iOS and Safari versions, the step that failed |
| 3 | A real phone | the heaviest scene (the reference market, the demo's garden) on a mid-range phone, the frame rate overlay (`?fps`) | the lowest FPS seen (≥ 30 wanted), the phone |
| 4 | Playtesters | five people who do not know the puzzles, each on their own phone, no help given | their session files (below), then `npm run verify:field` |
| 5 | Recorded voices | `npm run voices -- check --release` after recording: lines approved out of lines with an id | the count, the lines left |
| 6 | Listening | each score on a phone speaker and on headphones: stems following the game, each bridge once, nothing cut short, nothing left playing after a save is loaded, a voice during a bridge | the row, and each fault with its room and what was heard |
| 7 | Signed tag | `git tag -s vX.Y.Z` with the maintainer's key, `git tag -v` shows it | the row |

## Playtesters (pass 4)

1. Send the game's URL. Say only: "play as you like; when you stop, finished or not, open the pause menu and tap
   *Share session*". Do not explain a puzzle, even when asked: write down the question.
2. *Share session* makes a file with the inputs since the game started (ids and indices only, no journal text, no
   name), the device family (`ios`, `android` or `desktop`, nothing finer), and the near misses (a tap on nothing
   next to a target, by room and target). The tester sends it the way they like.
3. Drop the files into `games/<id>/playtests/` (committed; `npm run audit` covers it), then:
   - `npm run playtests -- --out=.cache/playtests`: play time per room, where players stall, hints shown, where they
     stopped, near misses, a heat map on the puzzle graph;
   - `npm run verify:field`: `verify:commercial`, then five sessions that still replay, three played to the end, two
     device families. The numbers are the quotas of a release tested by players; a game can ask more with
     `npm run playtests -- --strict --require=N --require-completed=N --require-devices=N`.
4. What the report shows becomes work: a stall is a puzzle to clue better, a near miss a hotspot to widen, an abandon
   a place to look at. The sessions stay: once the content changes they may no longer replay, and `--strict` says
   which (re-record or delete them).

## The sheet

Copy `docs/dev/passes/TEMPLATE.md` to `docs/dev/passes/<version>.md` before tagging, fill what was done, leave
"not done" where nothing was. `scripts/release-notes.mjs` puts the table in the release notes with "n of 7 done".

## The Field Kit (4.1.18)

Since 4.1.18 a pass is a JSON report, not a hand-edited row: one file per pass, bound to the **candidate run** it
tried (its commit, its run id and the SHA-256 of every file it judged), in a folder that also holds that run's
`candidate-manifest.json`. Thirteen passes, each by a stable id: `bridge-postgres-https`, `runs-real-players`,
`run-resume-power-cycle`, `code-wheel-human`, `mystery-deployed`, `safari-ios-offline-update`, `firefox-real-offline`,
`phone-both-renderers`, `livesplit-obs`, `connectors-real-security`, `blind-playtesters`, `voices-listening`,
`archive-human-install`.

```sh
npm run field:init -- --release=4.1.18 --candidate=<run id>     # the thirteen reports at not-run, in .cache/field/4.1.18
npm run field:check -- --dir=.cache/field/4.1.18                # schema, candidate, evidence SHA-256, leak scan
npm run field:report -- --dir=.cache/field/4.1.18 --out=docs/dev/passes/4.1.18.md
npm run field:bundle -- --report=<report.json> --out=<bundle.tar.gz>   # what a reproduction ticket carries
npm run field:verify-bundle -- <bundle.tar.gz>                          # integrity, then authenticity on GitHub
gh attestation trusted-root > trusted-root.jsonl                        # once, while online
npm run field:verify-bundle -- <bundle.tar.gz> --offline --trusted-root=trusted-root.jsonl
```

- **Four words, never merged**: `not-run`, `blocked`, `failed`, `passed`. Only `passed` is done in the release notes,
  and only `passed` may lift a surface's `experimental` (D18). A pass is still reported, not blocking, for a 4.1.x tag
  (D12); `field:check --require=<id,…>` is there for the 4.2 gate.
- **What a pass tried says**: an operator (a pseudonym or a role, never an identity), when it started and finished, on
  what (OS, browser, device or versions) and the scenario. `passed` lists its evidence (each file's SHA-256 is
  checked) and no failure; `failed` says what failed; `blocked` says why in `notes`.
- **Nothing private, as far as a scan can tell**: the schema refuses a field it does not name; a report holding a key,
  a token, an email address or a bearer is refused. The leak scan is a hygiene barrier made of patterns, not a proof:
  it cannot see a secret it has no pattern for, and in an image or a binary it looks for keys and tokens only. Read
  what you attach. A bundle carries only the evidence its report lists: logs are redacted (addresses, bearers,
  password values, IPs), a key or a token refuses the bundle, and its `bundle-manifest.json` gives every file's
  SHA-256. Reports and small redacted evidence may be committed under `docs/dev/field/<version>/` (`npm run audit`
  reads them); bundles stay run artefacts.
- **One issue per pass**: every pass a person makes is an open GitHub issue labelled `field-pass` (4.1.18: #75 to
  #87), saying what to try, what it needs and the evidence expected; the maintainer closes it once the test is made and
  its report checks. An open issue is a pass not made.
- **Integrity, not authenticity**: a report is checked against the `candidate-manifest.json` beside it, as given;
  `field:init` downloads it from the run itself (`gh run download`), and a folder whose manifest was edited checks
  against that edit. The release's own gate reads the run's manifest, never the folder's.
- **A bundle stands on its own** (4.1.19, schema 2): it carries the report, its evidence, the candidate's manifest and,
  from 4.1.19, the manifest's provenance attestation, which the candidate's gate signs after every job succeeded
  (`field:init` downloads it beside the manifest). `field:verify-bundle` reads the archive itself under budgets (16 MiB
  a file, 64 MiB in all, 256 files, 64 MiB compressed, one minute, the calls to GitHub included); a link, a device, an absolute path, a `..` or a
  name twice refuses it. It then checks every file against the bundle's manifest and the report against its
  candidate (integrity), and says who made the manifest (authenticity): offline, the attestation against a trusted root
  saved once, which proves a `candidate.yml` run on main signed it and names the run; online, the same attestation
  verified against the public trusted root, and the run read now (a candidate, green, started by hand on main). A bundle of an older candidate (no
  attestation) is checked online against the manifest the run keeps; offline it is said unverified.
- **Evidence is a file under `evidence/`** (at most 16 MiB, 64 MiB for one report; `field:check` says so before a
  bundle is tried), read where it is: not a link, not outside the folder once resolved, not an
  archive (what is inside cannot be read for a leak), never a report or the manifest.
- **Another commit, another pass**: a report of another candidate run, or whose file digests are not the candidate's,
  does not check. A fix that changes the package makes the reports it touches void until they are made again.

## Carrying a pass to a new candidate (4.1.20)

A pass is bound to its **surface**: the files of the candidate it reads (`docs/dev/surfaces.json`, the attested
`qualification-surfaces.json`; the built site counts file by file), the configuration it reads in the checkout, and
the passes it depends on (ADR 0024). When none of them changed between the candidate the person tried and a new one,
the version included, the pass may stand for the new candidate too:

```sh
npm run field:init -- --release=4.1.21 --candidate=<new run>   # keeps the new candidate's surfaces and site files too
npm run field:carry -- --from=.cache/field/4.1.20 --to=.cache/field/4.1.21 --pass=safari-ios-offline-update
```

- `field:carry` refuses any relevant difference and says which file. There is no force: run the pass again.
- Otherwise it writes a `pending` attestation and the source report's exact copy under
  `docs/dev/passes/carry/4.1.21/`.
- The maintainer approves it (`decision`, `approvedBy`) in a commit signed with their key. The trust root is
  `.github/allowed_signers` as the **source** candidate's commit holds it.
- `field:check` and `field:report` then count the pass as `passed` for the new candidate. The person's report is never
  rewritten: its four statuses stay four.
- A README-only change carries the PWA pass. A change to the service worker, the Bridge's archive or the mixing
  refuses the pass that reads it, and so does the version alone for the PWA, Mystery, resumed-run, speedrun and
  archive passes.
