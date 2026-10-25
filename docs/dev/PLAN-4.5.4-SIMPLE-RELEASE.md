# 4.5.4 "Simple release": the plan

Written on 25 October 2026, from the 4.5.2 and 4.5.3 releases of 24–25 October. The maintainer's target, in his words:
"really simplify the release: fewer manual steps, fewer surprises, and the CI improvements (#302) at the same time".
His state after 4.5.3: « I can't stand those silly process anymore ».

## 1. What went wrong this weekend

Each item cost a round of waiting, a manual step, or both. They are the requirements of this plan.

| # | What happened | Why | Cost |
|---|---|---|---|
| S1 | Every PR push waited 17–60 min for CI | `coverage` on every PR, `windows`/`node-24` for any `tools/` change, runners queued behind candidates (#302) | hours over the weekend |
| S2 | Updating a branch (conflicts, release notes) re-ran the whole CI | same as S1 | ~30 min each time |
| S3 | `v4.5.3-rc.1` was spent: no `## 4.5.3` in the CHANGELOG | the release PR had not been made; nothing checked before the tag | a burnt tag, a new candidate |
| S4 | The tag would have gone to the fork; the signature failed twice | `ship tag` pushed to `origin`; the git config signed with GPG while `ship` signs with SSH | two failed attempts |
| S5 | The release PR was 108 files, made by an agent | assembling fragments, golden save, passes sheet, transition pages, README figures, baseline, upgrade notes: all by hand | ~15 min of agent work, a big review |
| S6 | The golden save reset 4 human claim reviews | the golden-save list lives in `tests/save-v3.test.ts`, the file those claims' reviews are hashed on | a human round-trip |
| S7 | After merging the release PR: start the candidate by hand, wait ~90 min, then tag by hand | candidate is `workflow_dispatch` only | a human must come back twice |
| S8 | `docs-publish` failed: 7 claims and 263 pairs not human-reviewed (4.5.2), then a deploy key refused (4.5.3) | the publication check runs only at the very end; the org's deploy-key policy was never checked | two failed releases of the docs, one rerun |
| S9 | `docs-publish` waits for a human click on every release | required reviewers on the environment | one more manual step |
| S10 | npm: 5 `npm stage approve <id>` by hand, ids copied from a log | staged publishing with 2FA (D34) | 5 commands, error-prone |
| S11 | `ship` printed nothing for minutes; 404s in logs looked like failures | silent waits; expected 404s not said | confusion, anxiety |

## 2. The target

From "let's ship 4.5.4" to "it is on npm", the maintainer does **three things**, and never comes back to restart something:

1. **Merge the release pull request** (made by one command, CI in minutes).
2. **Run one command** on his machine: `npm run release -- 4.5.4`. It checks everything first, waits for the candidate
   (which started by itself when the release PR merged), signs and pushes the tag, follows the release, and ends by
   approving the npm packages (his 2FA).
3. **Nothing else**: the docs publish themselves, the site refreshes itself.

Elapsed time: the candidate's ~90 min, during which he does nothing. Every check that can fail runs **before** the tag.

## 3. Goals, non-goals, anti-goals

**Goals**
- G1. Three human actions per release (above). No manual workflow dispatch, no ids to copy.
- G2. Every failure that can happen after the tag is checked before it (S3, S4, S8): a pre-flight that says GO or the
  one thing to fix.
- G3. A docs, tooling or release PR's CI in 2–4 minutes (#302).
- G4. The release PR made by a command, small enough to read (generated files apart).
- G5. Every wait says what it waits for and how long it usually takes.

**Non-goals**
- Changing what is tested at release time: the candidate keeps running everything; `main`'s CI keeps `--all`.
- Changing npm's 2FA or staged publishing (D34): an owner still approves, with 2FA.
- Changing the signed tag (D37): the maintainer's key still signs.

**Anti-goals** (a failure even if it "works")
- A release that publishes something no human approved: the tag signature and the npm 2FA stay the two human gates.
- Hiding a failing check to go faster: a check moves earlier or off the PR path, it is never removed.
- A process only Claude can run: every step is a command the maintainer can run alone, documented in the wiki.

## 4. The changes

### A. CI in minutes for a non-product PR (#302) – S1, S2
- `tools/ci-plan.ts`: a `coverage` gate; off for `docs/`, `wiki/`, `changes/`, `.github/` (except `ci.yml`),
  `tools/release/`, `tools/wiki/`, `scripts/release-notes.mjs`, tests-only changes. The job says "not needed by the
  plan" and succeeds (the ruleset requires it by name). Always on for `main` and `--all`.
- `windows` and `node-24`: only for `cli/`, `scripts/pack*`, `scripts/start.mjs`, `tests/run-tool.ts`, `bridge/`,
  `studio-server/`, `package*.json` (what behaves differently there); not for `tools/release/`, `tools/wiki/`.
- Flaky required jobs out of the required set: `pwa-firefox` (#257) until fixed. The ruleset change is a setting the
  maintainer applies (documented, `gh api` command given).
- `candidate.yml`: `max-parallel` on its matrices so a PR's jobs are not queued 20 min behind it.

### B. One command makes the release PR – S5, S6
- `npm run release -- prepare 4.5.4` (new, `tools/release/prepare.mjs`), on a fresh branch `release/4.5.4` from main:
  version bump, `changes -- --assemble` (it handles a `.log.md` without `.md`, and creates `## Unreleased` itself –
  both were done by hand for 4.5.3), golden save, passes sheet, transition pages, README figures, quality baseline,
  the CHANGELOG intro and the upgrade-notes section as **skeletons** with the assembled bullets (a person or an agent
  writes the prose), translation records for generated pages (`--kind ai`). It commits, pushes, opens the PR.
- The golden-save list moves out of `tests/save-v3.test.ts` into `tests/fixtures/saves/index.json` (the test reads it),
  so a release never changes a test file that claims are reviewed on (S6). The move itself changes that file once: the
  four claims on it (`play-save-refused-untouched`, `save-refused-untouched`, `save-stale-pruned`,
  `save-foreign-game-refused`) need a person's review again, in that PR, and never after.
- **The pre-flight's checks that need no candidate run here**, before the PR is opened, and again in the release PR's
  CI: the CHANGELOG section, the docs' human gates (E), the signing key and remote of the machine running `prepare`.
  A failure costs a commit, never a candidate.

### C. The candidate starts itself – S7
- `candidate.yml` also runs on `push` to `main` **when the push is a release PR's merge** (the version in
  `package.json` changed). Still `workflow_dispatch` for other SHAs. `ship` and `release.yml` keep accepting only a
  candidate run on `main` (they check `event` is `workflow_dispatch` today: extend to `push` on `main`).

### D. One command releases – S3, S4, S8, S10, S11
- Run by a maintainer who owns the organisation, the repository (admin) and the npm packages: today LostInBrittany and
  wanoo both are. A check that the runner's account cannot read is said as "not checked: <why>", never as passed.
- `npm run release -- 4.5.4` (new entry in `tools/release/ship.mjs`, `ship release`), from the maintainer's `main`:
  1. **Pre-flight, before anything** (fails with the one thing to fix): the CHANGELOG section on the commit; the
     signing key loadable by `git tag -s` with the repo's config and named in `allowed_signers`; a remote for the org
     repository; the org allows deploy keys; the `docs-publish` environment accepts `v*` tags; npm trust configured for
     the five packages; `wiki -- check --publish` on that commit with the candidate's report (or, while the candidate
     runs, at the end of the candidate itself – see E).
  2. Finds the candidate of the release commit (started by C), waits for it and for `main`'s CI, **printing progress
     every minute** (jobs done / total, the slowest running). A candidate job that fails is **re-run once by itself**
     (`gh run rerun --failed`, same run id, a new attempt), saying which job and why; a second failure stops the
     command and names the job. The provenance check accepts the run's latest attempt.
  3. Signs and pushes the tag (as `ship tag` does since #300).
  4. Follows `release.yml`, printing each job as it ends; says that `npm-stage`'s 404s are expected.
  5. Runs the npm approvals itself: `npm stage list`, then `npm stage approve` for the five packages, engine first,
     the maintainer's 2FA in his terminal (S10). Then `npm view … dist-tags` to confirm.
  6. Ends with one summary: GitHub release, npm versions, docs version, site.
- If interrupted, running it again resumes at the first step not done (each step checks the state, as `ship tag`
  already does for a tag).

### E. The docs publish themselves – S8, S9
- **A docs problem never holds back the code or npm.** `npm-stage` and `docs-publish` stay side by side in
  release.yml, as today: a docs failure leaves the packages alone.
- **The docs' human gates are checked before the release PR merges**, where a fix is one more commit and no candidate
  is lost: `prepare` (B) and the release PR's CI run the part of `wiki -- check --publish` that needs no test report
  (claims reviewed by a person, pairs recorded, the source-set rule) and fail on it. The part that needs the
  candidate's report (each claim executed) runs at the end of the candidate as a **warning**, repeated by the
  pre-flight of `release`: the release goes on, and the docs are republished later (`docs-publish` in `revision`
  mode) if it fails.
- `docs-publish` in `release` mode no longer waits for a reviewer: the signed tag is the approval. The required
  reviewers stay for the manual modes (`revision`, `rollback`, `promote`). Implemented as two environments:
  `docs-publish` (release, no reviewer, `v*` tags only) and `docs-publish-manual` (reviewers, `main` and `docs/*`).
  The maintainer applies the environment settings (commands given). `WIKI_DEPLOY_KEY` becomes a secret of both
  environments.
- The 4.5.3 refusal ("Permission to …wiki.git denied to deploy key") was the organisation's policy: a new
  organisation disallows deploy keys (`deploy_keys_enabled_for_repositories: false`). It was turned on on 25 October
  2026; the pre-flight checks it stays on (`gh api orgs/Quest-n-Click`, readable by an owner).

### F. Documentation
- `wiki/en|fr/contribute.releasing.md` rewritten around the three actions; the old step-by-step kept as "what the
  command does", for when it stops.
- A decision record (next D-number): "A release is three human actions", superseding the manual parts of D55's chain.

## 5. Order of work (each a PR, small, merged before the next)

1. **A** (CI in minutes): first, so every following PR is quick.
2. **B** (prepare command + golden-save list).
3. **C + E** (candidate on release merge; docs check in the candidate; docs-publish environments).
4. **D** (`release` command).
5. **F** with each PR, plus the 4.5.4 release itself as the test: made entirely with the new commands.

## 6. Decided by Claude (to check)
- The command names: `npm run release -- prepare <v>` and `npm run release -- <v>`.
- Two environments for docs-publish rather than conditional reviewers (GitHub has no per-mode reviewer setting).
- No rc in the default flow: a pre-release stays possible (`npm run release -- 4.5.4-rc.1`), it is not a step.
- `pwa-firefox` leaves the required set now (it can be put back once #257 is fixed).
- A docs problem never blocks the release or npm; the docs' human gates fail the release PR instead (E).
- A failed candidate job is re-run once automatically by `release`, and said; a second failure stops (D).
- The four save claims are re-reviewed once, in PR B (moving the golden-save list).

## 7. Left to the builder
- How `prepare` writes the skeleton prose (template text), the exact progress format, the file layout of the new
  modules, test design (the existing `tests/release-*.test.ts` style: pure functions plus workflow-text assertions).
