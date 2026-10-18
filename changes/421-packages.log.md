## 4.2.1 PR 9 (second part): the Studio Server's release archive and its passes

Branch: ci/421-packages · Plan §7 rows 8 and 9, §11

- **The package** (`scripts/pack.mjs`, `scripts/pack-manifests.mjs`): `web-scumm-studio-server`, two commands
  (`bin/server.mjs`, `bin/worker.mjs`) that run the server and the worker of the engine installed beside it, after
  checking it is the same version; the Studio's page built at pack time (`client/`); `openid-client`, `jose` and `pg`
  locked (`scripts/locks/web-scumm-studio-server.json`, by `npm run locks`); the engine an optional peer (`4.2.x`),
  since it is not on npm and no lock can name it. One package for both commands: the worker holds no secret either
  way, and the two run from the same engine.
- **The engine's archive** ships `bridge/src/allowlist.ts`: `inAllowlist`, out of the Bridge's server (still exported
  there), the one piece of it the Studio Server imports.
- **The candidate**: `studio-install-smoke` (`scripts/studio-install-smoke.mjs`), in the gate: the two archives in an
  empty folder, the engine's template imported, `serve` on the loopback (its probes, the Studio's page, the API), the
  worker's probe. Run here from a local pack: green.
- **The release**: the archive and its SBOM (`scripts/sbom.mjs`) in `tools/release/artifacts.mjs` from 4.2.1 on
  (`since`: an older tag is judged without them), in `release.yml` (guarded for older tags), in the preflight's
  packages and the nightly's watched npm names.
- **The passes**: `studio-hosted` and `studio-collab` in `PASS_IDS` and `docs/dev/surfaces.json`, asked of a release
  from 4.2.1 on (`passesFor`, a surface's `since`): an older sheet keeps its thirteen rows.

→ next: Claude (the 4.2.1 release candidate, once PR 7's second part is merged)
