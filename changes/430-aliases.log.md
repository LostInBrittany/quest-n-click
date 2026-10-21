## 4.3.0: the web-scumm aliases removed (D47)

- D47 kept the former names as full-copy aliases through 4.2.x, removed in 4.3; D48 makes main the 4.3 line. Removed:
  the alias packing in `scripts/pack.mjs` (`aliasManifest`, `oldCommand`, `create-web-scumm`), the old `bin` entries
  in `scripts/pack-manifests.mjs` and the three locks, `cli/web-scumm.mjs`, the alias SBOMs in `scripts/sbom.mjs`, the
  `web-scumm/*` path in `tsconfig.json` and the `web-scumm` branch of the import alias in `vite.config.ts` and the
  hosted preview build, the engine looked up as `web-scumm` by the Studio Server's launcher, the Bridge's version read
  from a `web-scumm(-bridge)` package, `tools/bridge.ts`'s `web-scumm-bridge/cli` and `tools/dist.ts`'s exception.
- Kept: `tools/release/artifacts.mjs` (`ALIASES_UNTIL`), so a release up to 4.2.5 is still judged with its aliases
  (`ship verify v4.2.5`); the format identifiers; the provenance of releases up to v4.2.4 under `wanoo/web-scumm`;
  the scripts that install old releases by their old names; the nightly's watch on the old npm names.
- The pack no longer decides by version: main is the 4.3 line and a 4.2.x fix branches from `v4.2.5` (D48). A
  candidate built from main before the version is 4.3.0 would miss the aliases its manifest still expects for 4.2.5;
  only the 4.3.0 candidate proves the archives, SBOMs and release files agree. `tests/release-artifacts.test.ts`
  holds the 4.3.0 candidate's packages and SBOMs to the five new names.
- `tools/migrate-name.ts`: `quest-n-click migrate` renames, before it loads the game, the `web-scumm/…` imports of the
  project's sources (both quote styles; a format identifier or a URL is left alone), `tsconfig.json`'s paths and
  includes, `package.json`'s script commands and a former dependency the new one replaces; then runs again in a new
  process that reads the renamed tsconfig. `--check` exits 1 while any is left.
- The hosted engine upgrade (`studio-server/src/worker/migrate.ts`): the child renames the snapshot's imports before
  loading the game; the Studio accepts a source outside the migration's files only as exactly `renameImports` of the
  text it has. The guard's baseline of a head that does not load is that failure, so the upgrade can be written; its
  Undo, which would put the old imports back, is refused.
- Second reading (4.3.0): the hosted rename is the Studio's own step (`EngineUpgrade.renameFormer`: `renameImports` on
  the head's texts, no game code), a revision of its own judged by the validator alone (the game loads after it, and
  gains no error if it loaded before), never by the solver, so an unfinished game is not stuck; written without an
  undo, so the owner's earlier history stays reachable; the schema's migration follows, its 422 saying the rename was
  kept. The worker says a game whose code does not load apart from a failing job (`unloadable`, `GameDoesNotLoad`);
  the guard takes only that for a head's baseline (then judges an edit by whether the game loads after it) and turns
  a worker that cannot answer into a 503, never cached; an edit after which the game would no longer load is a 422.
  `tools/migrate-name.ts` follows symbolic links inside the project and names those that lead out or nowhere, leaves a
  `web-scumm` script beside a `quest-n-click` one and says so, keeps package.json's indentation and byte order mark.
  `tools/mutate.ts` resolves `quest-n-click/…` only. UPGRADING's `grep`/`sed` covers every source extension, spaces in
  names, `public` and hidden folders.
- `scripts/external-consumer.mjs` and `scripts/upgrade-check.mjs` move an old game as its author would: uninstall
  `web-scumm`, install `quest-n-click`, `npx quest-n-click migrate`, then the new commands; the external consumer also
  fails when an alias archive or a `web-scumm…` command is still packed. `scripts/studio-install-smoke.mjs` and the CI's
  connectors job check the old commands are gone.
- Tests: `tests/former-name.test.ts` (rewritten: nothing of the aliases left, the rename's rules and a project
  renamed on disk), `tests/studio-engine-upgrade.test.ts` (a game still under the former name upgraded as one
  revision, its Undo refused; a rename-only answer accepted, a rename plus anything refused),
  `tests/release-artifacts.test.ts`, `tests/reality-store-backup-mutants.test.ts`.
- `tests/fixtures/game-4.1` keeps its `web-scumm/…` imports (a 4.1.x game as it was) and leaves the type check
  (`tsconfig.json`'s `exclude`): nothing resolves them any more, and the tests rename them or let the upgrade do it.
- Docs (en, fr): UPGRADING §39, README, PACKAGE, SUPPORT, API, TOOLS, STUDIO-SERVER.

→ next: the 4.3.0 release PR bumps the version; its candidate is the first to pack and publish without the aliases.
