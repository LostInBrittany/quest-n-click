# 4.6.x "A release in three commands": the plan

Written on 4 November 2026, the day of the 4.6.0 release, from #410 and its comment. The target is the one
[PLAN-4.5.4-SIMPLE-RELEASE.md](PLAN-4.5.4-SIMPLE-RELEASE.md) set and 4.6.0 missed: `npm run release -- prepare <v>`,
merge the release pull request, `npm run release -- <v>`. Nothing written or reviewed by hand on release day that a
pull request could have written or reviewed; nothing waited for twice.

What 4.5.4 decided stays: the tag signature and the npm 2FA are the two human gates; a check moves earlier, it is never
removed; every step is a command the maintainer can run alone.

## 1. What 4.6.0 cost (the requirements)

| # | What happened | Where it came from | Item |
|---|---|---|---|
| R1 | 18 `TODO(release)` in 7 files, mostly restating the fragments | `prepare` leaves every sentence to a person | #410 1 |
| R2 | 11 claim reviews typed on release day | the claims were written weeks earlier, in their pull requests, unreviewed | #410 2 |
| R3 | The upgrade notes' `from-4-5-6-to-4-6-0` section doubled, a "name 4.6.0" TODO in a lead that named it | `prepare` always appends and always edits the lead | #410 3 |
| R4 | The Studio Server's lock kept the peer `4.5.x`: `qualify` could not pack (797ba349, by hand) | `prepare` bumps the version, not the locks | #410 3 |
| R5 | The nightly's warm-up red on `reality-cursor.test.ts:249` | a 1 ms timer racing a 5 ms reconnect | #410 4 |
| R6 | Long CI waits between each step | runs the release does not need | #410 5 |
| R7 | The candidate red on `coverage-ratchet --strict` (#411, fixed by #412), a second candidate | the strict ratchet's cliff is first met where nothing can be fixed cheaply | comment 1 |
| R8 | `--commit` and `--start-candidate` exist, nothing offers them | the red-candidate stop names only a re-run | comment 2 |
| R9 | One failed `git fetch` or tag push stopped the command (GitHub incident) | no retry on Git's network steps | comment 3 |
| R10 | Run 41819835975 had no `release` job; the command said `gh run rerun --failed`, which re-runs nothing | the stop always says `--failed` | comment 4 |
| R11 | "the checkout is on release/4.6.0" | `prepare` leaves the checkout on its branch | comment 5 |

## 2. The pull requests, smallest and safest first

### PR 1 – mechanical fixes of the two commands (R3, R4, R8, R9, R10, R11) – this branch, `tools/410-simpler-release`

One commit each, a failing test first. No workflow, no wiki page changes: what the commands print is all that moves.

- **a. Retries on Git's network steps (R9).** `retried(step, { tries: 4, waitMs: 15 s })` in `tools/release/lib.mjs`
  (synchronous, on the release clock so `QNC_RELEASE_CLOCK=virtual` makes its waits instant). Used for `git fetch` in
  `prepare` and in the release command, and for `ship tag`'s fetches and its tag push. Reads and idempotent writes only:
  a tag pushed twice at the same object is "up to date". Each retry is said (`⚠ … failed, try 2/4, again in 15 s`).
  Tests: `tests/release-retry.test.ts` (succeeds on the third try; gives up after four with the last error; waits
  between, never after the last). Risk: a refused push (a tag moved) retried for 45 s before the same error – a
  slower failure, never a different one.
- **b. A release run where no job ran (R10).** `rerunCommand(id, jobs)` in `release-run.ts`: `--failed` only when a job
  failed, was cancelled or timed out; otherwise `gh run rerun <id> --repo …` (all jobs). Used by the release run's
  stop and by the candidate's second-attempt stop. Tests in `tests/release-run.test.ts`.
- **c. The way on from a red candidate (R8).** The second-attempt stop of `candidateStep` ends with: when the fix is a
  later commit of main, `npm run release -- <v> --commit=<that sha> --start-candidate`. Tests: the message.
- **d. The checkout on `release/<v>` (R11).** Chosen: **the refusal gives the commands**, `git switch main && git pull
  --ff-only <remote> main`, naming the organisation's remote, in one line that replaces the separate "git pull first".
  Not chosen: `prepare` switching to main after its push. The release branch is where review fixes are committed while
  the pull request is open, and after the merge main must be pulled anyway: the command has to say the pull either way.
  `prepare`'s last line also says the next commands. Tests: `releaseRefusals` with a remote, on `release/<v>`.
- **e. The locks' engine peers (R4).** `withManifestPeers(lock, manifest)` in `scripts/pack-manifests.mjs` sets only
  `packages[""].peerDependencies` to the manifest's; `prepare`'s new step `locks` (after `version`) applies it to every
  `LOCKED` lock and writes only the ones that changed. Never `npm run locks`, which would move other packages (797ba349).
  Tests: on a minor bump the real locks pass `lockProblems` after it, nothing else in them moves, a patch changes nothing.
- **f. An upgrade-notes section written ahead (R3).** When the page already has `<a name="from-<prev>-to-<v>">`, the
  section is kept, the CHANGELOG bullets go in an HTML comment at its end ("to check this section against; delete this
  comment"), no `TODO(release)`. The lead is left alone when it already names `<v>`. Tests: 4.6.0's pages as they were
  before e4df77a3 (fixtures), en and fr.

What the wiki says about these (`contribute.releasing`: "re-run first (`gh run rerun <id> --failed`)") stays true; the
page gains the new lines in PR 3, with the other release-page edits, so its pair is reviewed once.

### PR 2 – the coverage ratchet can no longer stop a candidate (R7)

Planned, not implemented here: it changes a workflow (`ci.yml`) or what a release gate does, so it is the maintainer's.

Where the strict ratchet runs today: `ci.yml`'s `coverage` job, `--strict` off pull requests (main's pushes, sharded
then merged); `release-check:ci` in the candidate's `release-core`, `--strict` on a single unsharded run. A pull request
only warns. So a floor drifts to 2.78 points under on main (77.78 for 75, green) and the candidate's own measure, 0.22
higher (78.00), crosses the 3-point line. Two facts make "run it in `prepare`" a poor fix: `prepare` would need a full
`test:coverage` (minutes), and a local measure is neither CI's merged one nor the candidate's, so a floor raised to
"measured − 2" locally could exceed CI's measure and fail Vitest's threshold instead – a worse surprise.

Recommended design, two small changes:
1. **The candidate warns, main fails.** `release-check:ci` runs the ratchet without `--strict` (an annotation, as on a
   pull request); `ci.yml` keeps `--strict` on main's pushes. A floor too low is no defect of the release: it is a
   ratchet to make, and main's own CI already holds it. Vitest's floors themselves stay a failure everywhere.
2. **Strict on pull requests too**, so the pull request that lifts the coverage raises its floor (one more commit there),
   and main can no longer turn red after a merge on a ratchet it never saw: `ci.yml` line `coverage-ratchet.ts
   ${{ … && '--strict' || '' }}` becomes `--strict` always where `coverage` runs. Plus `coverage-ratchet --write`:
   raises each floor three points or more under to two under the measure (the repository's convention), writing
   `tests/coverage-floors.json`, so the fix is one command.

Files: `package.json` (`release-check:ci`), `.github/workflows/ci.yml`, `tools/coverage-ratchet.ts` (its logic as a pure
function for the tests), `tests/coverage-ratchet.test.ts`, `wiki/{en,fr}/contribute.coverage-ratchet.md` (where it is
strict). Risk: a pull request now fails on a ratchet it made; the job prints the `--write` command. The anti-goal
"hiding a failing check" is respected: the check moves to the pull request, main keeps it.

### PR 3 – the release page and the flaky warm-up (R5, and PR 1's lines in the wiki)

- `tests/reality-cursor.test.ts:249` waits for the acknowledgement itself (resolve a promise on `acknowledge`, then
  read), instead of a 1 ms timer racing a 5 ms reconnect. One issue for it; no quarantine mechanism until a second
  flaky test asks for one.
- `wiki/{en,fr}/contribute.releasing.md`: the retries, "all jobs" when none ran, `--commit … --start-candidate`, the
  switch to main, the locks' peers. One pair to review.

### PR 4 – fewer CI round trips (R6)

Workflow changes, each tested only by running them: list what the release needs (main's `ci` on the tagged SHA, the
candidate) and drop the rest from the path. Candidates: `qualify` on the release pull request when main ran it on the
same tree (the release commit moves version fields only); the warm-up nightly folded into the candidate's own cache
step. A measurement of 4.6.0's timeline first (`gh run list` for the day), then a proposal with minutes saved.

### PR 5 – claims reviewed in the pull request that changes them (R2) – a process change: the maintainer decides

Today `wiki -- check --publish --reviews-only` fails only the release pull request (`release -- check`), so every claim
added since the last release waits for release day.

- **Option A (recommended): the same check on every pull request that touches `wiki/` or a claim's test file**, a
  required job, as the translation pairs already are. The person who reviews the pull request types the
  `review-claim … --kind human` it prints; the review lands in the branch's `changes/<slug>.acks.json` (#360), folded
  at the release. A claim whose test file changed later (#404) fails that later pull request, with the claim named.
  Release day then has no review left on a normal day.
- Option B: the check warns on pull requests and fails only the release (today, plus a warning): cheaper per pull
  request, keeps release-day reviews.
- Option C: claims reviewed by an agent (`--kind ai`) in the pull request, a person only at the release: keeps a human
  gate on release day by design.

Risk of A: a test-file edit (S6 of 4.5.4: the golden-save list) resets claims hashed on the whole file. Hashing a claim
on its test's own block rather than the file would cut that; measure how often it happens first.

### PR 6 – `prepare` writes the prose (R1) – a process change: the maintainer decides

Of 4.6.0's 18 markers, 10 were the LOG's release entry, whose bullets are mostly facts `prepare` holds: the fragments
(their slugs and pull requests), the reviews (the acks fold), the fixtures (golden save, reference run), the passes
(`passIssues`), the signature (the release command's). The rest: the CHANGELOG intro, two README lines, the passes
sheet's intro, the upgrade notes' opener.

- **Option A (recommended): facts written, one sentence per fragment.** `prepare` fills every LOG bullet it holds the
  facts of; each fragment may carry one `### Release` line ("what it changes, for whom") that the CHANGELOG intro, the
  README line and the upgrade notes' opener are assembled from. A marker is left only when no fragment gave a line.
  `changes -- --check` checks the new heading's shape. Release day: a reread of a draft in the release pull request.
- Option B: fewer places for prose. The README line becomes the CHANGELOG intro's first sentence; the LOG entry drops
  the bullets that restate the CHANGELOG; the passes sheet's intro is generated from `passesFor` against the previous
  version. Cuts about 13 markers without any new fragment format.
- Option C: an assistant writes every marker in the release pull request (what happens today, by hand): no change to
  the tools, release-day work stays.

A + B together leave two or three sentences on release day, written in the pull requests that made the changes.

**Implemented (4.7.1, branch `tools/410-pr6-prose`): the maintainer chose A + B.** What `prepare` writes now:

- **Facts in the LOG's release entry**, each step filling the bullet it holds the data of: *What ships*, the pull
  requests merged on main since the tag `v<previous>` (`git log --first-parent`, merges and squashes, the release
  branch's own left out), number and title, oldest first; *Fragments*, how many, main's commit, their slugs and the
  ones that gave the release lines; *Upgrade notes*, the section written ahead or appended; *Reviews*, the pending
  files the fold took in (pairs and claims, a person's named, an AI's record only counted, what it could not keep);
  *Fixtures*; *Passes*, against `passesFor(<previous>)`; *Signature*, a key `.github/allowed_signers` names.
- **The passes sheet's intro** when `passesFor` asks the same passes as the previous version (4.6.0's and 4.7.0's
  sentence); a change of passes stays a marker, the passes added or removed named in it.
- **A fragment's `### Release`** (one or two sentences, `changes --check` refuses an empty one, a list, over 400
  characters, no full stop, twice) joined in the assembly's order into the CHANGELOG's intro, after the LOG range and
  before "The upgrade notes say what a game has to do.", and into the README's current-release line (option B: the
  README line is the intro's sentences). **`### Release (fr)`** for `README.fr.md`, written only when every fragment
  with a `### Release` has one: the CHANGELOG and the LOG are in English, the README is not, and a French line that
  left a change out would say less than the English one. Translating at release day is the work this removes; the
  author of a change writes both while it is fresh, as for a wiki pair.

What stays a `TODO(release)`, and why: the LOG entry's **title** (the release's theme, a sentence about all of it),
its **request** (who asked, when, in what words: a person's memory, not the repository's) and its **→ next** (a
judgement); the **upgrade notes' opener** when `prepare` appends the section (what a reader upgrading must do, rewritten
from the bullets; a section written ahead has none); an intro or README line no fragment gave a line for; a passes
sheet whose passes changed; "What ships" in a clone without the previous tag. Counted on the 4.5.3 fixture
(`tests/release-prepare.test.ts`): 16 markers before, 5 with release lines in both languages (the three LOG ones and
the two openers), 8 without any (plus the intro and both README lines). The upgrade notes written ahead, as 4.6.0's and
4.7.0's were, leave 3.

## 3. Decided by Claude (to check)

- Item d: the refusal gives the commands; `prepare` stays on its branch (§2, PR 1 d).
- Item g (R7) planned, not implemented: its fix is a workflow and a gate's strictness, the maintainer's call.
- Retries: four tries, 15 s apart (45 s of waiting at most), for fetches and the tag push only; `ls-remote` reads and
  `gh` calls keep what they have (`ghJson` already retries for five minutes).
- The upgrade notes' bullets in an HTML comment carry no `TODO(release)`: the section was written by a person ahead,
  the comment is a help, not a gate.
