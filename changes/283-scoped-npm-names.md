### Breaking

- **The packages are named under the `@quest-n-click` scope** (4.5.2, D53, #283). `quest-n-click` is
  `@quest-n-click/engine`, `create-quest-n-click` is `@quest-n-click/create` (`npm init @quest-n-click my-game` once on
  npm), and the Bridge, the connectors and the Studio Server are `@quest-n-click/bridge`, `@quest-n-click/connectors`
  and `@quest-n-click/studio-server`: the npm organisation `quest-n-click` owns them. A game imports
  `@quest-n-click/engine/content` (`/player`, `/minigames`, `/testing`, `/reality`); `npx quest-n-click migrate` rewrites
  its `quest-n-click/…` imports, its `tsconfig.json` and its dependencies, and through 4.5.x the unscoped imports still
  resolve (Vite, the engine's `tsconfig.json`, a hosted Studio). The commands keep their names (`quest-n-click dev`,
  `npx quest-n-click-bridge serve`), and so do the release's archives (`quest-n-click-4.5.2.tgz`, …). Installed, the
  packages sit under `node_modules/@quest-n-click/`. Nothing is published on npm yet.

### Changes

- **`quest-n-click create` writes the scoped engine** (4.5.2, D53): the dependency `"@quest-n-click/engine"`, the
  `@engine/*` and `@quest-n-click/engine/*` paths into `node_modules/@quest-n-click/engine`; the template imports
  `@quest-n-click/engine/…`. `@quest-n-click/create` carries `repository` and `engines`, which a provenance publish
  needs, and every manifest `publishConfig.access: public`.
- **The npm names watched as the organisation's** (4.5.2, D53): `ship preflight-stable` and the nightly `npm-names` job
  ask the scoped names, ours when an owner of the organisation (`lostinbrittany`, `wanoo`) publishes them, and check
  each unscoped name as a pointer (an owner's, deprecated; someone else's blocks the preflight, a free or undeprecated
  one is a step still to take). The trust hints name `@quest-n-click/<name>`.
