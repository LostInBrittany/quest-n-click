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
