# Releasing

How a version is made, for the maintainer (4.1.20 "Last Mile"; plan §11). The commands are `npm run ship -- …`
(tools/release/ship.mjs); every one writes its PID to `.cache/pids/`.

## The chain

1. **A candidate on main.** `gh workflow run candidate --ref main -f sha=<full sha>` runs every heavy family on that
   SHA, the full qualification profile on its own archives and image, the three loads, the signing rehearsal. Its gate
   writes and attests `candidate-manifest.json`, with every file the release will publish (tools/release/artifacts.mjs).
   Read the gate **and** its conclusion.
2. **A tag that names it.** `npm run ship -- tag <version> <sha> --candidate=<run> --now`. The annotation names the run.
3. **The release, from that run.** release.yml downloads the run's files and checks every SHA-256 against the
   manifest. It then makes the release a **draft**, uploads every file, publishes it and reads it back
   (`ship verify`). It builds nothing the candidate made: archives, image, SBOMs, the site, the surfaces. From 4.1.20
   it also needs the run's signing rehearsal, so a candidate made before that release's PR 3b cannot be released:
   start a new one. One release run per tag at a time: a second one waits, then finds the first's release.
4. **Read back.** `npm run ship -- verify <version>` downloads the release, checks the sums, every provenance
   attestation and the list of files against the manifest. From 4.1.20 it also runs `gh release verify` and
   `gh release verify-asset` for each file.

A published release is never changed. A run on a release already published stops before it makes anything. A failed
RC is not fixed: it becomes an `rc.N+1`.

## What the maintainer turns on (once, after 4.1.20 PR 3b)

- **Immutable releases**: Settings → General → Releases. A published release then keeps its files and its tag.
- **A ruleset on the release tags**: target `tag`, `refs/tags/v*`, active. It restricts creation, refuses deletion
  and forbids force-push.
- `npm run ship -- preflight-stable --candidate=<run>` must then see both. **Before the first 4.1.20 tag**: `ship tag`
  refuses to tag while immutable releases are off (release.yml's token cannot read that setting).

## Signing 4.2's tags

4.1.x tags stay annotated (D30). 4.2's are signed with the maintainer's SSH key:

```sh
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
npm run ship -- tag 4.2.0-rc.2 <sha> --candidate=<run> --sign --now
```

- The key must also be registered on GitHub as a **signing** key (Settings → SSH and GPG keys).
- It must be in `.github/allowed_signers`, added in a commit signed by that key (8cebea2, made by Claude at the
  maintainer's request: D37). That is also the trust root of carried passes (ADR 0024). With `id_ed25519` the
  signature proves the key was used, not that the maintainer approved: an approval is recorded explicitly (D37).
- Each candidate rehearses the path with an ephemeral key (`signing-rehearsal`): it signs a tag of the commit that is
  never pushed, checks it with `git verify-tag`, then destroys the key.

## The 4.2 preflight

`npm run ship -- preflight-stable --candidate=<run> [--version=4.2.0]` signs nothing, publishes nothing and changes
no setting. It says, one check at a time, `ok`, `missing` (a step still to take) or `blocked` (something wrong):

- the signing key, local and registered;
- `allowed_signers`;
- immutability and the tag ruleset;
- the candidate's provenance;
- for each npm package: the archive (`npm publish --dry-run`), the name, the bootstrap, the trusted publisher
  (stage-only), an OIDC publication proven, and the version not already published;
- the publishing step's exact Node and npm;
- GO / NO-GO against the people's reports.

It exits 1 only on a `blocked`.

## npm (written in 4.1.20, played in a later 4.2.x)

4.2.0 is published on GitHub Releases only (D38): every step below needs the maintainer's 2FA, and 4.2.0 did not
wait for it. The steps are unchanged; the first version they publish is a 4.2.x.

Nothing is published to npm in 4.1.x. The four names (`web-scumm`, `create-web-scumm`, `web-scumm-bridge`,
`web-scumm-connectors`) are free. Each night a job that does not gate checks that they still are, or that they are
ours (D34: squatting is an accepted risk until npm publishing, a 4.2.x, D38).

1. **Versions.** Staged publishing needs npm 11.15.0 and Node 22.14.0 at least ([npm docs][staged]). release.yml pins
   the publishing step to **exact** versions, `NPM_PUBLISH_NODE: 22.23.3` and `NPM_PUBLISH_NPM: 11.21.0`. A test
   refuses a range. Node 22.23.3 ships npm 10.9.9: the publishing step, written in 4.2, will install npm 11.21.0 itself (`npm install -g npm@11.21.0`); in 4.1.20 only the pins exist, in release.yml's env.
2. **The account.** The maintainer's npm account has 2FA on.
3. **Bootstrap, once per package.** The packages do not exist yet. Stage a **reservation version**, never a product
   version:

   ```sh
   npm stage publish <archive of 0.0.0-bootstrap.0>
   ```

   - Run it from a local session of the maintainer, or with a stage-only token.
   - Staging a package that does not exist publishes a `0.0.0-stage` placeholder until it is approved
     ([npm docs][staged]). Check with `npm view <name>` whether that is enough to configure the package. If it is not,
     approve the bootstrap (`npm stage approve <id>`, with 2FA).
   - A local publication carries no OIDC provenance. That is why it never carries a version of the product.
4. **Trusted publishing, stage-only.** On each package, run:

   ```sh
   npm trust github <name> --repo wanoo/web-scumm --file release.yml --allow-stage-publish
   ```

   - CI may then stage, never publish.
   - The configuration must make its first publication within **two days**, or it expires: configure it just before
     the 4.2.0 release run.
5. **Promotion.** The release run stages each package by OIDC. The maintainer promotes each one with 2FA
   (`npm stage approve <id>`, or on npmjs.com). 4.2.0, published from the status candidate's run, is the first version
   of the product.
6. **Dual-use classification of `web-scumm-connectors`** (decided in 4.1.20, PR 3b):
   - npm's [dual-use policy][dual] covers "security-relevant capabilities that can resemble malicious software":
     penetration-testing tools, security research utilities, code obfuscation.
   - The connectors are servers a game runs (an SSH and a Telnet front for its terminal, an email webhook and IMAP
     reader, an Open Badge verifier). They scan nothing, attack nothing and hide nothing. **They are not declared
     dual-use.**
   - They go through staged publishing and a 2FA promotion anyway, as all four packages do. That is the publishing
     method the policy asks of dual-use content.
   - If npm's publish-time scan holds or flags the package, add `"contentPolicy": { "class": "dual-use" }` and a
     `DISCLOSURE` file. The declaration then persists across versions.

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/
