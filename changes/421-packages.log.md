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

- **Second reading** (automated second context), fixed:
  - npm reads no shrinkwrap from an archive file, and nests the lock's dependencies under the package when it does
    (a registry install): the engine's sources found `openid-client` and `pg` only by hoisting. The launcher now runs
    node with tsx's loader and a resolve hook (`bin/resolve.mjs`) that finds the package's own dependencies from it;
    `deps` imports each, and the smoke runs it on a hoisted and a nested install (without the hook the nested one
    fails: `Cannot find package 'jose'`). No tsx command between the launcher and the server: a Ctrl-C reaches it
    once (the launcher forwards SIGINT only without a terminal);
  - the preflight counted 13 passes and asked every package of any release: the passes come from
    `docs/dev/surfaces.json` and the packages from their `since`;
  - `field:check` says a report of a pass the release is not asked, and a `--require` of one;
  - tests: the 4.2.1 sheet (15 rows), what a 4.2.0 and a 4.2.1 are asked;
  - "locked" said for what it is: the lock and the SBOM, and a registry install;
  - left: a minor bump (4.3.0) makes `npm run locks` needed again, the peer range following the version.

→ next: Claude (the 4.2.1 release candidate, once PR 7's second part is merged)
