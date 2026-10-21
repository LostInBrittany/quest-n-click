### Breaking

- **The `web-scumm` names are gone (4.3.0, D47)**: the release no longer ships `web-scumm-<version>.tgz`,
  `create-web-scumm`, `web-scumm-bridge`, `web-scumm-connectors` or `web-scumm-studio-server` (nor their SBOMs), the
  packages no longer carry the `web-scumm`, `web-scumm-bridge`, `web-scumm-connector`, `web-scumm-studio-server` and
  `web-scumm-studio-worker` commands, and `web-scumm/content` and the other old imports no longer resolve. A game still
  under the old name runs `npm uninstall web-scumm`, installs `quest-n-click`, then `npx quest-n-click migrate`, which
  now renames its `web-scumm/…` imports, its tsconfig's paths and its scripts' commands (`--check` names what is left;
  UPGRADING §39 also gives the `sed` by hand). On a hosted Studio such a game does not load until its owner runs the
  engine's upgrade, which renames its imports as one revision. Format identifiers (`web-scumm-save`, sessions, `.wsrun`,
  storage keys, headers, `WEB_SCUMM_*`) keep their names, and releases up to 4.2.5 keep their files.
