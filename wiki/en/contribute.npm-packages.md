# npm packages

The engine ships as five npm packages, packed from the files git tracks by
[`scripts/pack.mjs`](../../scripts/pack.mjs) and attached to every GitHub release. This page says what each package
holds, how the packages are checked, and where publishing them to the npm registry stands. How to install them as a
user is in [Package reference](install.package.md).

<a name="packages"></a>

## The five packages

| Package (archive) | What it holds | Since |
|---|---|---|
| `@quest-n-click/engine` (`quest-n-click-<v>.tgz`) | The engine (`src/`), its pages, its tools, the `quest-n-click` command, the game template (`games/_template/`), and from 4.5.0 its documentation bundle `docs-bundle/`; never a game of this repository, a test, a source doc page or a build | 3.9 |
| `@quest-n-click/create` (`create-quest-n-click-<v>.tgz`) | `npm init @quest-n-click <folder>`, which runs `quest-n-click create` | 3.9 |
| `@quest-n-click/bridge` (`quest-n-click-bridge-<v>.tgz`) | The reference Reality Bridge (one module, its policies): a game that does not run one never installs it | 4.1.1 |
| `@quest-n-click/connectors` (`quest-n-click-connectors-<v>.tgz`) | The connectors of the world outside (one module, its MIME worker): an operator's, never a game's | 4.1.9 |
| `@quest-n-click/studio-server` (`quest-n-click-studio-server-<v>.tgz`) | The Studio online and its worker (two commands, the Studio's page): an operator's, beside the engine | 4.2.1 |

The engine's package takes only tracked paths under its roots (`src/`, `tools/`, `studio-server/`, part of
`bridge/src/`, `cli/`, `games/_template/`, the icons and fonts, `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt`, the worker's Python lock, `LICENSE`). An untracked file under one of those roots
stops the pack ("git add or commit them, or add them to .gitignore") rather than being left out silently. The Bridge,
the connectors and the Studio Server carry their versioned lock as `npm-shrinkwrap.json`; a lock that no longer fits
its manifest stops the pack: `npm run locks` makes it again (review the diff, commit it), and `npm run locks -- --check`
says whether each lock still fits without the network.

From 4.2.5 to 4.2.x each package was also packed under its former web-scumm name, an alias with the same files and
version (D47). 4.3.0 packs the new names only; `npx quest-n-click migrate` moves a game off the old ones.

From 4.5.2 the packages are named under the npm organisation's scope (D53): an organisation owns only scoped packages,
so the five names belong to `quest-n-click`, whose owners can each approve a publication.
From 4.2.5 to 4.5.1 they were `quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`,
`quest-n-click-connectors` and `quest-n-click-studio-server`: those names are kept as deprecated pointers to the scoped
ones. The commands keep their names (`quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`…), and so do the
archives a release attaches: `scripts/pack.mjs` renames npm's `quest-n-click-engine-<v>.tgz` back to
`quest-n-click-<v>.tgz`, so the release's files, sums and attestations keep their names. Each manifest carries
`publishConfig.access: public`, its `repository` and its `engines`.

```sh
# in the engine repository
npm run pack                                   # the five archives in .cache/pack
node scripts/pack.mjs --out=.cache/pack --publish-dry-run   # and what `npm publish` would send for each
```

<a name="how-it-is-checked"></a>

## How the packages are checked

- **`npm run fresh-install`** (CI job `fresh-install`, when the plan says a package, the template or an authoring path
  changed): packs the engine, creates a game from the packed template in an empty folder outside the repository,
  installs the tarball, runs `assets`, `verify` and `build` (every file of `dist/` accounted for), and plays the game
  to its ending in Chromium. A file of the new project that names the repository fails it.
- **`npm run external-consumer`** (CI job `external-consumer`, and in the candidate on Ubuntu, macOS and Windows on the
  candidate's own archives, `--tarballs=`): the archives used the way a third party uses them. It reads each archive
  (name, version, licence, binaries, exports, no `file:` or `link:` dependency, no checkout path; the documentation
  bundle's files against their sha256); creates a game on an older release (`--from`, 4.1.17 by default), moves it to
  the candidate as its author would (uninstall the old package, install `@quest-n-click/engine`, `npx quest-n-click migrate`),
  plays an old save and a new game to the ending; calls `read_doc`, `list_docs` and `search_docs` through a real MCP
  client over stdio; runs `create-quest-n-click` from its archive; installs the Bridge (init, doctor, serve on SQLite, and on
  Postgres when `CONSUMER_PG_URL` is set) and the connectors, then a signed email webhook accepted, the same message a
  duplicate, a bad signature refused.
- **`--publish-dry-run`** in `release-check` and in the candidate's `pack` job: what `npm publish` would send.
- **SBOMs**: the candidate makes one CycloneDX SBOM per archive (`scripts/sbom.mjs`), from what the archive holds.

<a name="npm-publishing"></a>

## Publishing to npm: not done yet

Every release attaches the five archives; **none is published on the npm registry** as of 4.5.1. Install from the
release archive ([Install from the release archive](install.from-archive.md)). The steps below were written in 4.1.20
for a 4.2.x; 4.2.0 was published on GitHub Releases only (D38), because every step needed the maintainer's 2FA, and no
later release has played them yet. 4.5.2 names the packages under the organisation (D53), whose two owners can each
approve; the publishing step in `release.yml` and a `next` channel follow in a later pull request of #283.

> [!LIMIT id=not-on-npm]
> As of 4.5.1, `npm install @quest-n-click/engine` from the registry does not install this project: the scoped names
> hold a reservation version only (`0.0.0-bootstrap.0`), not the product. Use the release's `.tgz` files.

<a name="npm-names"></a>

### The names, watched every night

The five scoped names (`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors`, `@quest-n-click/studio-server`) and the former ones (`web-scumm`, `create-web-scumm`,
`web-scumm-bridge`, `web-scumm-connectors`, `web-scumm-studio-server`) are checked each night by the `npm-names` job of
`.github/workflows/nightly.yml`, which never gates: each is "still free" (a 404), "ours" (published by an owner of the
organisation, exactly), or a warning "taken" in the run summary for the maintainers to act. The owners are a list,
`OWNERS` in `tools/release/preflight.mjs` and its copy in the job: npm shows an organisation's members only to its
members, and CI has no token. Today it holds `lostinbrittany`; Erwan's npm user joins it once he joins the
organisation. The unscoped names of 4.2.5 to 4.5.1 (`quest-n-click`, `create-quest-n-click`, `quest-n-click-bridge`,
`quest-n-click-connectors`, `quest-n-click-studio-server`) are pointers: the job expects each to be an owner's and
deprecated, warns when one is not deprecated or is someone else's, and notes one still free (to reserve).
`create-quest-n-click` is the exception, a **relay**: published on an owner's account, its command does
`await import('@quest-n-click/create/index.mjs')`, so `npx create-quest-n-click my-game` keeps working and runs the
same thing as `npm init @quest-n-click my-game`. The job expects it to be an owner's and **not** deprecated. It needs
`@quest-n-click/create` to keep `index.mjs` at its root and no `exports` map (`tests/pack-manifests.test.ts`).

<a name="publishing-steps"></a>

### The publishing steps (written in 4.1.20, for a later 4.2.x)

1. **Versions.** Staged publishing needs npm 11.15.0 and Node 22.14.0 at least ([npm docs][staged]). release.yml pins
   the publishing step to **exact** versions in its env, `NPM_PUBLISH_NODE: 22.23.3` and `NPM_PUBLISH_NPM: 11.21.0`;
   `tests/release-stable.test.ts` and `ship preflight-stable` refuse a range. Node 22.23.3 ships npm 10.9.9: the
   publishing step, when it is written, installs npm 11.21.0 itself (`npm install -g npm@11.21.0`). Only the pins
   exist today.
2. **The accounts.** The organisation `quest-n-click` requires 2FA of its members; each owner's account has it on.
3. **Bootstrap, once per package** (done on 24 Oct 2026 for the five scoped names, tag `bootstrap`). A package that does
   not exist gets a **reservation version**, never a product version:

   ```sh
   # in the folder holding the archive, from the maintainer's own session (or with a stage-only token)
   npm stage publish <archive of 0.0.0-bootstrap.0>
   ```

   - Staging a package that does not exist publishes a `0.0.0-stage` placeholder until it is approved
     ([npm docs][staged]). Check with `npm view <name>` whether that is enough to configure the package. If it is not,
     approve the bootstrap (`npm stage approve <id>`, with 2FA).
   - A local publication carries no OIDC provenance. That is why it never carries a version of the product.
4. **Trusted publishing, stage-only.** On each package:

   ```sh
   # anywhere, signed in to npm as an owner of the organisation
   npm trust github @quest-n-click/<name> --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   ```

   - CI may then stage, never publish.
   - The configuration must make its first publication within **two days**, or it expires: configure it just before
     the release run that will use it.
5. **Promotion.** The release run stages each package by OIDC. An owner of the organisation promotes each one with
   2FA (`npm stage approve <id>`, or on npmjs.com).
6. **Dual-use classification of `@quest-n-click/connectors`** (decided in 4.1.20, PR 3b):
   - npm's [dual-use policy][dual] covers "security-relevant capabilities that can resemble malicious software":
     penetration-testing tools, security research utilities, code obfuscation.
   - The connectors are servers a game runs (an SSH and a Telnet front for its terminal, an email webhook and IMAP
     reader, an Open Badge verifier). They scan nothing, attack nothing and hide nothing. **They are not declared
     dual-use.**
   - They go through staged publishing and a 2FA promotion anyway, as every package does. That is the publishing method
     the policy asks of dual-use content.
   - If npm's publish-time scan holds or flags the package, add `"contentPolicy": { "class": "dual-use" }` and a
     `DISCLOSURE` file. The declaration then persists across versions.

`npm run ship -- preflight-stable --candidate=<run>` checks, for each package, the archive, the name (ours when an owner
of the organisation publishes it), the bootstrap, the trusted publisher, an OIDC publication proven, the version not yet
published, and from 4.5.2 its unscoped pointer (an owner's, deprecated) ([Releasing](contribute.releasing.md#preflight)).

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/

<a name="related"></a>

## Related

- `npm run pack`, `npm run fresh-install`, `npm run external-consumer`, `npm run locks`, `npm run ship`.
- [Releasing](contribute.releasing.md), [Package reference](install.package.md), [Install from npm](install.from-npm.md).
