# Install from npm, once published

**The engine is not published on npm.** Its packages are named under the organisation `quest-n-click` (D53):
`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` and
`@quest-n-click/studio-server`. On 24 Oct 2026 each holds only a reservation version, `0.0.0-bootstrap.0`, never a
version of the product. The unscoped names of 4.5.1 and before (`quest-n-click`, `quest-n-click-bridge`, …) are kept
by the maintainers as deprecated pointers to the scoped ones, except `create-quest-n-click`, which stays a relay to
`@quest-n-click/create`. Until a release's notes say otherwise, install from the
release archive: [Install from the release archive](install.from-archive.md). This page says how to tell when npm is
ready, and what the commands will be then.

<a name="what-you-get"></a>

## What you get

Today: a way to check, in one command, whether an `@quest-n-click/engine` package on npm is the project's. Once the
packages are
published: a game project created and upgraded with npm's usual commands, without an archive URL.

<a name="context-and-versions"></a>

## Context and versions

- A **created project**, on your machine.
- No version of the product has ever been published to npm, up to and including 4.5.1. 4.2.0 went to GitHub Releases
  only (D38): publishing needs a maintainer's two-factor authentication at each step, and 4.2.0 did not wait for it.
  The npm organisation `quest-n-click` (two owners, so two people can approve) and the scoped names come with 4.5.2
  (D53). 4.5.2 is also the first release that release.yml stages on npm: its packages are published once an owner
  approves them, not before, and `npm view @quest-n-click/engine version` says when.
- Until the first publication, the names are only watched: a job of the nightly workflow (`npm-names`, never gating)
  checks that each scoped name, and each former `web-scumm…` one, is still free or published by an owner of the
  organisation, that each unscoped name is an owner's deprecated pointer (`create-quest-n-click`: an owner's relay,
  not deprecated), and warns otherwise.

> [!LIMIT id=npm-not-published]
> No `npm install @quest-n-click/engine`, `npm init @quest-n-click` or `npm install @quest-n-click/engine@<version>`
> installs the engine today: the scoped names hold a reservation version only. The unscoped `quest-n-click` names are
> deprecated pointers or, for `create-quest-n-click`, a relay; never the engine itself. A package under one of these names published by someone other than the
> organisation's owners is not the project's: do not install it.

<a name="prerequisites"></a>

## Prerequisites

- The [Requirements](install.requirements.md) of any game project: Node.js 22.12 or newer, Python 3 for the art.
- A release whose notes announce the npm publication.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, from the folder that will contain the project; then inside the created project.

<a name="steps"></a>

## Steps

<!-- step: check-owner -->
1. Check that the package is published and is the project's. Its maintainers must be owners of the organisation
   `quest-n-click` (`lostinbrittany` today), its repository `github.com/Quest-n-Click/quest-n-click`, and its `latest`
   a version of the product:

   ```bash
   # anywhere
   npm view @quest-n-click/engine maintainers repository.url dist-tags
   ```

   Today `dist-tags` names no product version (only `bootstrap`, the reservation): stop here and use the
   [release archive](install.from-archive.md).

<!-- step: create-from-npm -->
2. Create the project. Either command does the same thing (`@quest-n-click/create` runs `quest-n-click create` from the
   engine it depends on):

   ```bash
   # in the folder that will contain the project
   npm init @quest-n-click my-game "My Game"     # or: npx quest-n-click create my-game "My Game"
   ```

   `npx create-quest-n-click my-game "My Game"` still works too: the unscoped `create-quest-n-click` is a relay that
   runs `@quest-n-click/create`, the same thing.

   Without `--engine`, `create` writes the dependency `"@quest-n-click/engine": "^<version>"`, which npm resolves from
   the registry.

<!-- step: install-and-play -->
3. Install, prepare the art and play, as from the archive:

   ```bash
   # from the folder that contains the project, then inside it
   cd my-game
   npm install
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   npm run assets && npm run dev
   ```

<a name="expected-result"></a>

## Expected result, and how to check it

Once published, step 1 prints the maintainer and the repository; step 2 ends with
`my-game: "My Game" created (@quest-n-click/engine ^<version>).` A project made from an archive moves to the registry with
`npm install @quest-n-click/engine@<version>`, which replaces the archive's URL in its `package.json` by a version range.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm view @quest-n-click/engine dist-tags` names only `bootstrap` (and npm's `0.0.0-stage` placeholder) | Not published yet | [Install from the release archive](install.from-archive.md) |
| `npm view` shows a maintainer who is not an owner of the organisation | A name taken by someone else | Do not install it; report it on the project's issues |
| `npm warn deprecated quest-n-click@0.0.1: …` | An unscoped name of 4.5.1 and before, now a pointer | Install `@quest-n-click/engine` instead |

<a name="files-changed"></a>

## Files or data changed

Step 1 changes nothing. Steps 2 and 3 write the same project as [from the archive](install.from-archive.md#files-changed);
only the dependency in `package.json` differs (a range instead of a URL).

<a name="recovery"></a>

## Recovery or going back

A project created from npm goes back to an archive with `npm install <archive URL>`, as
[Upgrade](install.upgrade.md) describes.

<a name="how-it-will-be-published"></a>

## How the publication is prepared

The procedure was written in 4.1.20; from 4.5.2 release.yml stages the packages, and the first release an owner
approves is the first one on npm. The details are on [npm packages](contribute.npm-packages.md). What a user can rely on:

- **Staged publishing with a person's approval.** The release run stages each package through GitHub's OIDC (trusted
  publishing, configured stage-only: CI may stage, never publish), and the maintainer promotes each one with
  two-factor authentication (`npm stage approve <id>`, or on npmjs.com); either owner of the organisation can approve.
  A version of the product never comes from a
  local publication, which would carry no OIDC provenance; only a reservation version `0.0.0-bootstrap.0` may, once per
  package, to create it.
- **Exact tools.** Staged publishing needs npm 11.15.0 and Node 22.14.0 at least. release.yml's `npm-stage` job pins
  them exactly, `NPM_PUBLISH_NODE: 22.23.3` and `NPM_PUBLISH_NPM: 11.21.0`, installs npm 11.21.0 itself (Node 22.23.3
  ships npm 10.9.9) and checks both; a test refuses a range.
- **The connectors are not declared dual-use.** npm's dual-use policy covers tools that can resemble malicious
  software (penetration testing, security research, obfuscation); the connectors are servers a game runs (an SSH and a
  Telnet front, an email webhook and IMAP reader, an Open Badge verifier), scanning, attacking and hiding nothing.
  They go through the same staged publishing and two-factor promotion as the other packages. If npm's scan holds or
  flags the package, it gets `"contentPolicy": { "class": "dual-use" }` and a `DISCLOSURE` file.

<a name="references"></a>

## References

- [Install from the release archive](install.from-archive.md), [Package reference](install.package.md)
- [npm packages](contribute.npm-packages.md) (the maintainer's procedure), [Releasing](contribute.releasing.md)
- npm's documentation: [staged publishing](https://docs.npmjs.com/staged-publishing),
  [dual-use policy](https://docs.npmjs.com/policies/dual-use/)
- [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml) (the `npm-names` job),
  [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (the `npm-stage` job)
