# Releasing

How a version of quest'n'click is made, for the maintainer: a candidate run on main, a signed tag that names it, a
release that publishes that run's files and nothing rebuilt, then a read-back. The commands are
`npm run ship -- …` ([`tools/release/ship.mjs`](../../tools/release/ship.mjs)); every one writes its PID to
`.cache/pids/ship-<command>.pid` (`SHIP_PIDS` chooses the folder): to stop one, stop that PID, not a pattern.

<a name="what-you-get"></a>

## What you get

A published, immutable GitHub release `v<version>` built from the commit CI and the candidate tested, carrying its
archives, manifests, SBOMs, sums and provenance attestations, read back by `ship verify`; from 4.5.0, its
documentation published after that read-back.

<a name="context-and-versions"></a>

## Context and versions

In the engine repository, by the maintainer (it needs write access, the signing key and the repository settings).
The chain is the one of 4.1.20 "Last Mile" (plan §11); tags are signed from 4.2.0. This page holds from 4.2.0.

<a name="prerequisites"></a>

## Prerequisites

- The GitHub CLI `gh`, signed in as the maintainer.
- The repository settings turned on once ([below](#maintainer-settings)): immutable releases and the tag ruleset.
- The signing key set up ([below](#signing)).
- The CHANGELOG section of the version assembled from the `changes/` fragments (the release branch's job,
  [Conventions](contribute.conventions.md)), and the people's passes sheet started ([Field passes](contribute.field-passes.md)).
  `ship tag` refuses a commit without that section (4.5.3): merge the release pull request, then tag its merge commit.
- A git remote for `Quest-n-Click/quest-n-click`: `ship tag` fetches from and pushes to the one whose URL names it,
  `upstream` when `origin` is your fork (4.5.3).

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on the maintainer's machine, on `main` up to date. The release itself runs on GitHub
Actions (`.github/workflows/release.yml`), started by the tag's push (from 4.5.3; by the tag's `ci` run before). The
tag runs no `ci` of its own: the candidate is the release's only test pass, and main's `ci` on the same SHA is the
other thing release.yml checks.

<a name="steps"></a>

## Steps

<a name="prepare"></a>

### Prepare the release pull request

From 4.5.4, one command makes it, on an up-to-date `main`:

```sh
npm run release -- prepare 4.5.4 --name="Simple release"   # --dry-run lists the steps, --no-pr pushes nothing
```

It refuses, before writing anything: a version that is not `x.y.z` greater than `package.json`'s, uncommitted changes,
another branch, a shallow clone, a `main` that is not the organisation's (behind or ahead, or no remote names the
organisation's repository), no fragment in `changes/`, a new minor whose upgrade-notes page does not exist yet, a
release name the files cannot hold as written (4.5.5, #348: one with `( ) [ ] " « » \` \ $ < > |`, which the README's
release link, the CHANGELOG's quotes or the command it prints would break), a newest passes sheet without its
`<!-- field:begin -->` marker (the table it copies starts there), and, unless `--no-pr`, no place to push (your fork: `origin` when it is one, else the only fork among the remotes; the
organisation's repository when no fork is a remote, a branch, never `main`) or a `gh` that is not signed in. Then, on the
branch `release/<version>`, it runs what a release branch did by hand, in this order: the version
(`npm version --no-git-tag-version`), the CHANGELOG section and the LOG entries from the fragments
(`npm run changes -- --assemble`, which makes its own `## Unreleased` and folds a `.log.md` alone), the LOG's release
entry, the branches' pending acks folded into `wiki/translations.json` and `wiki/reviews.json` (`npm run wiki -- acks
--fold`; what no longer holds its text is printed, and repeated in the stop), the upgrade notes' section (en and fr), the transition pages, the golden save (listed in
`tests/fixtures/saves/index.json`), the reference run, the passes sheet and `passIssues`, the README's current-release
line (the previous summary kept under "Over …"), the quality baseline; one commit, the docs' human gates, then the pull
request.

If a step fails, it stops and says what to do: before the commit, nothing was pushed (`git reset --hard`, `git clean`,
back to `main`, the branch deleted: it prints the commands); after it, it prints the `git push` and `gh pr create` to
run by hand.

It writes no prose: each place a sentence is needed carries `TODO(release)` (the CHANGELOG's intro, the LOG's release
entry, the upgrade notes, the README, the passes sheet). A `TODO(release)` quoted as code, in backticks or a fenced
block, is a quotation and not a marker (4.5.5, #364): a CHANGELOG bullet about the markers, copied into the upgrade
notes, is never counted as one to write.

Before it pushes (from 4.5.5), it checks what the release pull request's CI would fail on: a `TODO(release)` left (the
same markers `check` counts) and the docs' human gates (`wiki -- check --publish --reviews-only`, a claim or a pair
still to be read by a person). When anything is left, it stops there and exits 1: nothing pushed, no pull request, the
branch committed in your checkout. One stop lists it all: each `TODO(release)` with its file, line and brief, then each
review with its command. On the local branch, write the prose yourself or ask your AI assistant to write it, with
those markers as the brief, and read the diff; record the translation pairs that changed (`npm run wiki -- check`
prints each command); a person reads each claim or pair and types its review command (`prepare` never writes prose
and never records a review, and calls no AI). Commit, then run the same
`npm run release -- prepare <version> --name="…"` again. On `release/<version>`, with `package.json` at the version,
the prepared commit on the branch and nothing uncommitted, it resumes there: when nothing is left, it pushes and opens
the pull request, so its CI runs once. Any other state of that branch is refused, with how to start again from `main`.
To see the reviews earlier, run `npm run release -- check <version>` on `main`: its docs' human gates item lists the
claims and pairs still to review (the items about the release itself fail there, as they should before `prepare`).

When it pushes (from 4.5.5), it also starts the warm-up of `main`'s mutation cache,
`gh workflow run nightly --repo <the organisation's repository> --ref main -f jobs=mutation`, and prints the run's link
(the pull request's body says it too): the release commit moves only version fields, which the mutation sets' input
hashes leave out, so the cache filled while the pull request is in review is the one the candidate its merge starts
reads. A dispatch refused (rights, `gh`) is a warning with that command to run by hand, never a failure. `--no-pr`
pushes nothing and starts nothing; it prints the command for when you open the pull request.

To check the branch at any point:

```sh
npm run release -- check 4.5.4
```

It says, item by item, whether `package.json` is at the version, the CHANGELOG has its section, the passes sheet
`docs/dev/passes/<version>.md` and the golden save (its entry in `tests/fixtures/saves/index.json` and its file) are
there (4.5.5, #348), a `TODO(release)` is left, `npm run wiki -- check` warns, the docs' human gates hold (`wiki -- check --publish --reviews-only`: a claim or a
pair a person must read, each printed with its command), and the quality baseline holds. The release pull request's
CI runs it too, with the version its branch names: merge when every item is ✔, and the merge starts the candidate.

<a name="release-command"></a>

### The release: one command

Once the release pull request is merged, on `main` up to date:

```sh
npm run release -- 4.5.4          # --dry-run says what it would refuse; --key=<key.pub> if git signs otherwise
```

It refuses first what would fail later (`package.json` not at the version, another branch, uncommitted changes, `main`
not the organisation's, no CHANGELOG section, no SSH signing key, `gh` or `npm` not signed in, an npm user who is not
an owner). Then it finds the candidate the merge started on that commit (`--start-candidate` starts one when there is
none) and waits for it (about 90 minutes), saying how many jobs are done and which run at each change and every five
minutes, re-running its failed jobs once (the whole run when it was cancelled before any job failed). Once is the
run's: its attempt number says it was re-run, by the command or by hand, so a relaunch never re-runs it a second time
(4.5.5, #348); the same holds for `ship`'s re-run of main's `ci`. An attempt still going after 3 hours stops the
command, with the run's link and the same command to resume; then `ship tag … --sign`: main's `ci`, the signed tag pushed to the
organisation's repository; then it follows the release run job by job until `release` and `npm-stage` succeed (the
documentation's jobs are said, never waited on: a docs problem never holds back npm), verifies the release's files,
and approves the npm packages the release staged, each with your 2FA in your terminal, the engine first; then one
summary. The release commit is where `package.json` became the version on main (or the tag's, once pushed), so what is
merged meanwhile does not move it. If it stops, run it again: a green candidate is not waited for again, a tag already
pushed is followed, a release `ship verify` already passed on is not verified again (4.5.5, #343: the same tag,
release and asset digests, the release immutable, as recorded in `.cache/release/v<version>.verified.json`;
`--reverify` verifies it anyway), a package already on npm is not approved again; a release run that failed (its `release` or
`npm-stage` job) is re-run first (`gh run rerun <id> --failed`, the command prints it). A pre-release (`-rc.N`) is
tagged by hand (`ship tag`, below). The chain below is what it runs, for when a step has to be done by hand.

Its preflight also checks the docs' human gates on the release commit itself (4.5.5, #339), in a temporary worktree
of that commit, since `main` may already be ahead of it. A claim or a pair merged after the release pull request's CI
ran shows there, before anything is waited for, and no longer at `docs-publish` an hour after the tag (4.5.4's
`import-layout-merges`). That commit's tree can no longer take a review, so the command stops with each pending item,
its command, and the one way on: `npm run release -- <version> --docs-revision` releases as usual, npm included, and
the docs follow as a revision once the release is out:

```sh
# in the engine repository
git switch -c docs/<version> v<version>
# record each review the stop listed (they land in changes/<version>.acks.json), commit
git push <the organisation's remote> docs/<version>
gh workflow run docs-publish --ref docs/<version> -f mode=revision -f version=<version>
```

When the release merge's own `ci` on main is red for a reason fixed only after it, the release cannot stand on it:
`release.yml` wants main's `ci` green on the tagged commit (`tools/release/main-ci.mjs`). 4.5.5 was the case: its
merge's `windows` job failed, fixed by #368 merged after it (4.5.6, #369). `--commit=<sha>` names a later commit of
main to release on instead, used everywhere the release commit is (the docs' gates, the candidate, `ship tag`, the
release run):

```sh
gh workflow run candidate.yml --repo Quest-n-Click/quest-n-click --ref main -f sha=<sha>   # if none ran on it
npm run release -- 4.5.5 --commit=<sha>
```

The command finds a candidate by its run's commit, and a run started by hand on `main` records main's head at that
moment, whatever `sha` says: start it while `<sha>` is main's head (or name main's head as `<sha>`).

It is refused, with what to do, when it is not a SHA the checkout knows, not on main's first-parent line, not at the
version in `package.json`, not the release merge or a commit after it, or when the tag is already out on another
commit. The command says which commit it uses and, when it is not the release merge, that it is not; each stop's
command to run again keeps `--commit`. Without it, nothing changes.

<a name="the-chain"></a>

### The chain

<!-- step: candidate -->
1. **A candidate on main.** From 4.5.4 the release pull request's merge starts it, on the merge commit (a push to
   `main` that moves `package.json`'s version; a dependency bump starts none). For another SHA, start it by hand:

   ```sh
   # in the engine repository
   gh workflow run candidate --ref main -f sha=<full sha>
   ```

   It runs every heavy family on that SHA, the full qualification profile on its own archives and image, the three
   loads and the signing rehearsal. Its gate (`candidate-gate`) writes and attests `candidate-manifest.json`, with
   every file the release will publish (`tools/release/artifacts.mjs`). Read the gate **and** its conclusion. Only a
   run started on main, by hand (`workflow_dispatch`) or by a release's merge (`push`), may be named by a tag; a pull
   request labelled `full-ci` runs it too, as information only. It ends with the documentation's publication check on
   its own test report, as a warning: a docs problem never holds back the release (the release pull request's CI
   already ran its human gates, `npm run release -- check`, and the release command runs them again on the release
   commit, [above](#release-command)).

   Its mutation shards reuse the reports the nightly saved on `main` (4.5.5, #329): only the sets whose inputs moved
   since run again, the others take a minute or two each. A change every set reads (the lockfile, `vite.config.ts`)
   moves them all: `prepare` starts the warm-up when it pushes the release pull request ([above](#prepare)); for
   another candidate, warm the cache by hand after the last merge with
   `gh workflow run nightly --ref main -f jobs=mutation` (the mutation jobs only, reusing what is already cached).

<!-- step: tag -->
2. **A tag that names it.**

   ```sh
   # in the engine repository
   npm run ship -- tag <version> <sha> --candidate=<run> --sign
   ```

   The previous stable tag must be an ancestor of the SHA. `--candidate=<run id>` is required from 4.1.17: the run must
   be green and its manifest must name this SHA and this run; the tag's annotation names it, and release.yml
   publishes that run's files. `ship tag` waits for main's `ci` run on the SHA to be green before it pushes the tag
   (re-run once): that run is what release.yml checks, since a tag runs no `ci` of its own (4.5.3). `--now`, which
   skipped that wait, is refused since 4.5.3. `--sign` signs the tag with the SSH key ([below](#signing)). `ship tag`
   refuses to tag while immutable releases are off. It then waits as `ship watch` does.

<!-- step: release -->
3. **The release, from that run.** The tag's push starts `release.yml` (from 4.5.3, #291). It checks that the tag
   still points to the commit the run was started for, that this commit is on main's first-parent line and that
   main's `ci` succeeded on a push at this very SHA (`tools/release/main-ci.mjs`), that the previous stable tag is an
   ancestor, and that the candidate named is a green run of `candidate` started by hand on main. It downloads the
   run's files and checks every SHA-256 against the manifest. It tests nothing again: no `release-check`, no mutation
   set, the candidate ran them on this SHA. It copies what the candidate made and builds nothing (archives, image,
   SBOMs, the site, the surfaces, the Remix catalogues' proofs). It then makes the release a **draft**, uploads every
   file, publishes it and reads it back (`ship verify`): minutes, not hours. A candidate that lacks one of its files
   cannot be released: from 4.1.20 the signing rehearsal, from 4.5.3 the Remix proofs (a candidate made before that
   change has none). Start a new one. If main's `ci` on the SHA is still running or red, the run stops with an error
   that says so: wait for it, then re-run the job. One release run per tag at a time: a second one waits, then finds
   the first's release.

<!-- step: verify -->
4. **Read back.**

   ```sh
   # in the engine repository
   npm run ship -- verify <version>
   ```

   It downloads the release and checks the sums, every provenance attestation and the list of files against the
   manifest; from 4.1.20 it also runs `gh release verify` and `gh release verify-asset` for each file. release.yml runs
   it as its last check.

<!-- step: npm-stage -->
5. **npm, staged then approved** (from 4.5.2). Once the release job succeeded, release.yml's `npm-stage` job stages
   the release's five archives on npm by trusted publishing (OIDC, no token), engine first, and its run summary lists
   the ids. An owner of the npm organisation approves each with 2FA, in the summary's order:

   ```sh
   # anywhere, signed in to npm as an owner of quest-n-click
   npm stage approve <id>
   ```

   A pre-release tag stages nothing (its archives carry the stable version): the job rehearses the OIDC exchange. A
   failed `npm-stage` makes the release run fail (`ship watch` exits 1) without touching the published release or the
   documentation; once fixed (often a trusted publisher missing), re-run the job alone. The procedure, and the first
   release through npm: [npm packages](contribute.npm-packages.md#staging-job).

> [!LIMIT id=published-never-changed]
> A published release is never changed. A run on a release already published stops before it makes anything. A draft
> left by a run that failed before publishing was never public: it is deleted (its tag stays) and made again from the
> same candidate. A failed RC is not fixed: it becomes an `rc.N+1`.

<a name="what-a-release-carries"></a>

### What a release carries

Each release is made from the files its candidate made on the tagged commit, carries its licences inside the archive,
and attaches: the built
game (`dist`), its assets manifest, the five npm package archives (`quest-n-click`, `create-quest-n-click`,
`quest-n-click-bridge`, `quest-n-click-connectors`, `quest-n-click-studio-server`; [npm packages](contribute.npm-packages.md)),
one CycloneDX SBOM per package and one for the Bridge's image (five SBOMs in 4.1.19, six since the Studio Server's
package in 4.2.1), the Bridge's image, the Remix catalogues' proofs, a complete speedrun of the reference chapter
verified by `speedrun:verify`, the candidate's runs, baseline, site files, surfaces and signing rehearsal, the
candidate's manifest, SHA-256 sums, and a build provenance attestation
(`gh attestation verify <file> -R Quest-n-Click/quest-n-click` from 4.5.2, see below for the releases before); from 4.5.0,
the documentation archive. It is never replaced
once published. What only people and real devices can check is reported in its notes ([Field passes](contribute.field-passes.md)).

A pre-release version (`4.1.8-rc.1`) is tagged the same way; release.yml marks it a pre-release on GitHub.

<a name="docs-publish"></a>
<!-- applies: 4.5.0.. -->

### The documentation, after the read-back

From 4.5.0, release.yml's `docs-publish` job `needs` the release job, so it starts only after `ship verify` passed. It
calls `.github/workflows/docs-publish.yml` with the tag, the SHA, the candidate run and the sha256 of the documentation
archive, promotes that archive (the candidate's, checked again), records it in `publication.json` and pushes the wiki;
an rc publishes `/docs/<v-rc>/` only. It is never started by `release: published`, which a release published with
`GITHUB_TOKEN` does not fire. Only the wiki's deploy key `WIKI_DEPLOY_KEY` is passed to it. See
[Writing documentation](contribute.writing-docs.md).

<a name="maintainer-settings"></a>

### What the maintainer turns on, once (after 4.1.20 PR 3b)

- **Immutable releases**: Settings → General → Releases. A published release then keeps its files and its tag.
- **A ruleset on the release tags**: target `tag`, `refs/tags/v*`, active. It restricts creation, refuses deletion and
  forbids force-push.
- **Two environments for the documentation** (from 4.5.4). `docs-publish`: a release's docs, published without a
  click (the signed tag is the approval): no required reviewer, a **tag** rule `v*` as its only deployment rule.
  `docs-publish-manual`: the runs by hand (revision, rollback, promote, preview), its required reviewers approve each,
  rules `main` and `docs/*`. Each holds the secret `WIKI_DEPLOY_KEY` (an environment's secret: its private key
  is entered again for the second). In this order: create `docs-publish-manual` (reviewers, rules, secret), then merge
  the change that names it, then strip `docs-publish` to the `v*` rule without reviewers; the other way round, a run by
  hand would find `docs-publish-manual` missing and GitHub would make it, unprotected. Without the `v*` rule the
  release's job is refused (the release itself is published; `mode=promote` from main recovers the documentation).
- `npm run ship -- preflight-stable --candidate=<run>` must then see the first two. **Before the first 4.1.20 tag**, `ship tag`
  refuses to tag while immutable releases are off: release.yml's token cannot read that setting (it needs admin read),
  so `ship tag` checks it with the maintainer's own access.

<a name="signing"></a>

### Signing the tags

4.1.x tags stay annotated (D30). From 4.2 they are signed with the maintainer's SSH key:

```sh
# in the engine repository
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
npm run ship -- tag 4.2.0-rc.2 <sha> --candidate=<run> --sign
```

- The key must also be registered on GitHub as a **signing** key (Settings → SSH and GPG keys).
- It must be in `.github/allowed_signers`, added in a commit signed by that key (8cebea2, made by Claude at the
  maintainer's request: D37). That file is also the trust root of carried passes (ADR 0024).
- `--key=<file>` gives another key file than `user.signingkey`.
- Each candidate rehearses the path with an ephemeral key (`signing-rehearsal`): it signs a tag of the commit that is
  never pushed, checks it with `git verify-tag`, then destroys the key.

> [!LIMIT id=signature-not-approval]
> With `id_ed25519`, the signature proves the key was used, not that the maintainer approved: an approval is recorded
> explicitly (D37).

<a name="preflight"></a>

### The stable preflight

```sh
# in the engine repository
npm run ship -- preflight-stable --candidate=<run> [--version=4.2.0]
```

It signs nothing, publishes nothing and changes no setting ([`tools/release/preflight.mjs`](../../tools/release/preflight.mjs)).
It says, one check at a time, `ok`, `missing` (a step still to take) or `blocked` (something wrong):

- the signing key, local and registered;
- `allowed_signers`;
- immutability and the tag ruleset;
- the candidate's provenance;
- for each npm package: the archive (`npm publish --dry-run`), the name, the bootstrap, the trusted publisher
  (on `release.yml`, stage-only), an OIDC publication proven, and the version not already published;
- release.yml's `npm-stage` job: it stages through `tools/release/npm-stage.mjs`, never `npm publish`, never a token;
- the staging step's exact Node and npm;
- GO / NO-GO against the people's reports ("GO for 4.2 on a reduced scope" is read with D38 written).

It exits 1 only on a `blocked`.

<a name="ship-commands"></a>

### Every `ship` command

| Command | What it does |
|---|---|
| `ship checks <pr>` | Waits for the pull request's checks; re-runs a failed job once; exit 1 if it fails again |
| `ship merge <pr>` | `checks`, then merges (a merge commit, the only method the ruleset allows); prints the SHA |
| `ship main <sha>` | Waits for main's `ci` run on that SHA to be green (re-run once) |
| `ship tag <version> <sha> --candidate=<run> [--sign [--key=<file>]]` | Waits for main's `ci` on the SHA, tags (above), pushes, then `watch` |
| `ship watch <version>` | Waits for the `release` run of the tag's push; exits by its conclusion |
| `ship verify <version>` | The read-back (above) |
| `ship preflight-stable --candidate=<run> [--version=<x.y.z>]` | The stable preflight (above) |
| `ship chain <pr> <version>` | merge → tag → watch → verify; refused from 4.1.17, whose tags need a candidate run of the merge commit (merge, candidate, then tag) |

Each command is idempotent and says what it waits for.

<a name="expected-result"></a>

## Expected result, and how to check it

`ship watch` exits 0 with the release run's success; `ship verify <version>` prints every file checked and exits 0;
the release page shows the files and "Immutable"; `gh attestation verify <file> -R Quest-n-Click/quest-n-click` passes for any
of its files, from 4.5.2. A release made before the transfer to the organization (D51) keeps its attestations under the
user wanoo: `gh attestation verify <file> --owner wanoo --signer-workflow wanoo/quest-n-click/.github/workflows/release.yml`
from 4.2.5 to 4.5.1, `gh attestation verify <file> --owner wanoo --signer-repo wanoo/web-scumm` up to 4.2.4 (`ship
verify` asks each release that way, and says that GitHub's own release attestation of those releases is not checked).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| ship tag: "no \"## x.y.z\" section in CHANGELOG.md at …" | The commit is not the release pull request's merge | Merge the release pull request, start a candidate on its merge commit, tag that |
| ship tag: "no git remote here points to Quest-n-Click/quest-n-click" | Only a fork is a remote here | `git remote add upstream git@github.com:Quest-n-Click/quest-n-click.git` |
| release.yml: "names no candidate run" | The tag was made without `--candidate` | Tag the next version (or `rc.N+1`) with `--candidate`: the tag ruleset refuses deleting a tag |
| release.yml: "run … is not a green candidate started on main" | The run is a pull request's, another branch's, or red | Start `candidate` by hand on main for that SHA |
| release.yml: "has no candidate-site" (or `-surfaces`, `-signing`, `-remix`, `-pack`, `-sbom`, `-image`) | A candidate made before the step existed | Start a new candidate |
| release.yml: "main's ci has not succeeded on …" | Main's `ci` run on that SHA is still running, red or cancelled | Wait for it (or re-run it) on main, then re-run the release job |
| release.yml: "is not on main's first-parent line" | The tag is on a topic branch's commit, not on a merge into main | Tag the next version on main's merge commit |
| `ship tag` refuses `--now` | `--now` is gone since 4.5.3 | Tag without it: `ship tag` waits for main's `ci` |
| "is published: a published release is never changed" | A rerun on a published tag | Nothing to do; a new version is a new tag |
| `ship tag` refuses: immutable releases off | The setting is not on | Turn it on (above), then tag |
| A failed RC | — | Tag `rc.N+1` from a new candidate |

<a name="files-changed"></a>

## Files or data changed

A tag `v<version>` (signed), a GitHub release with its files and attestations, `.cache/pids/ship-*.pid` locally;
from 4.5.0, the wiki and `publication.json` (through `docs-publish`). The release branch before it edits `CHANGELOG.md`,
`docs/dev/LOG.md` and `docs/dev/passes/<version>.md`.

<a name="recovery"></a>

## Recovery or going back

A published release cannot be changed or removed: a defect is fixed in a new version. A draft is deleted by the next
release run. A tag not yet released can be left alone and a new candidate tagged under the next pre-release number.

<a name="references"></a>

## References

- [`tools/release/ship.mjs`](../../tools/release/ship.mjs), [`tools/release/candidate.mjs`](../../tools/release/candidate.mjs),
  [`tools/release/artifacts.mjs`](../../tools/release/artifacts.mjs), [`tools/release/preflight.mjs`](../../tools/release/preflight.mjs),
  [`tools/release/signing.mjs`](../../tools/release/signing.mjs), [`tools/release/main-ci.mjs`](../../tools/release/main-ci.mjs).
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`.github/workflows/candidate.yml`](../../.github/workflows/candidate.yml).
- D30, D37, D38, D55; ADR 0024. [Field passes](contribute.field-passes.md), [npm packages](contribute.npm-packages.md),
  [Stability and support](start.stability.md#releases).
