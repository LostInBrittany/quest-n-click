## 4.1.20 PR 3b: the rehearsal of 4.2's operations

- Plan §11.1–11.2. Stacked on PR 4.
- The draft flow uses `gh release create --draft --verify-tag`, then `upload`, then `edit --draft=false`, then
  `ship verify`.
  - A published release stops the run with an error before anything is built.
  - A leftover draft is deleted. Its tag stays: `--cleanup-tag` is never used.
- Pins: Node 22.23.3 (the newest 22 LTS, 23 Sept 2026) and npm 11.21.0 (the newest 11; `npm stage` checked present in
  it). They sit in release.yml's env for the future publishing step, read by the preflight. A test refuses a range or
  a version below 22.14.0 or 11.15.0.
- Checked in npm's documentation (13 Oct 2026):
  - staging a package that does not exist publishes a `0.0.0-stage` placeholder until approval;
  - `npm trust github … --allow-stage-publish` makes a trusted publisher stage-only;
  - the dual-use policy targets pentest, security research and obfuscation tools.
  - A secondary article said a new package cannot be staged. npm's own page says otherwise, and the runbook follows
    npm and says what to check.
- The preflight reads a signing key on GitHub through the public `users/<login>/ssh_signing_keys`, which needs no
  extra token scope. The tests use fake gh/npm/git and check that no call writes.
- `ship tag --sign` is refused below 4.2.0 (D30).
- Second reading (subagent, 13 Oct, read-only probes of gh, npm 11.21.0's source and docs.npmjs.com). Fixed:
  - **P0: `ship preflight-stable` always crashed.** lib's `gh()` adds `-R`, which `gh api` refuses. It now asks
    `gh api user` directly.
  - **P1: a release could go public before `gh release verify` could pass.** That command needs immutable releases.
    `ship tag` now refuses to tag from 4.1.20 while they are off. It runs with the maintainer's admin access;
    release.yml's token cannot read that setting, which needs admin read.
  - "Not published yet" stops on any error of gh but "release not found".
  - **P1: the stage-only check read a field npm does not print.** npm prints one indented object per configuration,
    with `permissions` (createPackage: may publish; createStagedPackage: may stage). The check now reads each object
    and blocks on createPackage. The tests use that real shape.
  - Smaller fixes:
    - gh error bodies are no list: no crash, said missing;
    - a name is ours by its exact npm user (`npm whoami`), never a prefix; unknown when not logged in;
    - the nightly tells a 404 from a network error, and its job no longer sits under heavy's comment;
    - a tag ruleset with no bypass would block the maintainer too, so it is not `ok`;
    - the GO / NO-GO read is the sheet's last verdict;
    - the runbook says Node 22.23.3 ships npm 10.9.9, so the step installs npm 11.21.0 itself.
- **The jobs listing (13 Oct, while #120 was merging).** For an hour, GitHub's `actions/runs/<id>/jobs` answered HTTP
  502 to about two calls in three, for every run, while the rest of the API answered and githubstatus said all
  operational. #120's `candidate-gate` failed four times with every job green. The step also read a single page of
  100, which would drop a candidate's jobs past 100 in silence. `run-jobs.mjs` (tested against a fake API: a 502 then
  a 200, three pages, a 404 at once, every try spent, a total that does not add up) and a guard against any bare
  `gh api …/jobs` call in the workflows.
- **`fetch-retry.mjs` moves to `tools/release/` (14 Oct, merging #120 and #121).** #119's second reading added a test
  that no release tool imports `scripts/` (tools/ ships, scripts/ does not); `run-jobs.mjs` did. The module moves to
  the side that ships, and `external-consumer`, `readme-quickstart` and its test import it from there (scripts/
  already imports tools/). Same code, same tests.
- **Second reading on #122 (14 Oct): no P0, no P1, eight P2, all fixed.** release.yml runs one release per tag at a
  time (a rerun of the tag's `ci` fires it again; two runs could each make a draft); its "Not published yet" step
  keeps stderr apart (a warning beside a success read as "none"), refuses an answer it does not know, and deletes
  every draft of the tag, bounded. The step is now tested by running it under bash against a fake gh (none, one and
  two drafts, published, a warning, an unknown answer, an auth error); the old step fails those tests. `ship tag`:
  immutable releases off says so instead of a raw `gh api` failure; with `--sign`, an unsigned tag left here by a
  failed push is refused, never pushed. `preflight-stable`: a name is free only on npm's 404 (a registry that did not
  answer blocks the row), `user.signingkey` read as git does (`~/`, `key::`), a run gh cannot read is a blocked row.
  RELEASING says the npm install is 4.2's step, and that a 4.1.20 release needs a candidate made after this PR.
