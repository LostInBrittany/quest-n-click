## 4.1.19 PR 2: reproducible artefacts (locks, the image built once, five SBOMs, the proxy unprivileged)

- Plan §6.1–6.4.
- **Locks**: `scripts/pack-manifests.mjs` writes the manifests of the Bridge, the connectors and the image. Pack and
  `scripts/locks.mjs` share it.
  - The locks in `scripts/locks/` are made from the root lock: the root lock is copied beside the manifest, then
    `npm install --package-lock-only` keeps every version it already has.
  - They are checked by `lockProblems`: lockfile 3, the manifest's dependencies, registry-only with sha512, and the
    root lock's versions (`tests/pack-locks.test.ts`).
  - Pack copies them as `npm-shrinkwrap.json`. `ops:qualify` installs its host Bridge with `npm ci`.
- **Image**: `scripts/bridge-image.mjs` has three commands:
  - `context`: the Dockerfile, the archive, the image's manifest and its lock;
  - `build`: `docker save`, then the config digest, the OCI manifest digest from `index.json`, the archive's SHA-256,
    and a CycloneDX SBOM read inside the image (`npm sbom` in `/opt`) with the base image named by its digest;
  - `load`: loads the archive and checks all three identities.
  - `Dockerfile.bridge` runs `npm ci` in `/opt`, and the Bridge resolves its dependencies from the parent folder.
  - The candidate's new `image` job builds the image once. `deployment-smoke` takes `--image-from`, and the gate puts
    the image in the candidate's manifest.
- **SBOMs**: `scripts/sbom.mjs` writes four package SBOMs.
  - The Bridge and the connectors use their own shrinkwrap, read with `npm sbom --package-lock-only`.
  - The engine has no lock in its archive, so its dependencies are resolved from the root lock and read the same way.
  - `create-web-scumm` lists its one dependency, the engine archive, by its SHA-256.
  - `release.yml` publishes the candidate's SBOMs and image; a tag older than 4.1.19 keeps the old way.
- **Proxy**: Caddy runs as the operator's uid, read-only, with `/data` and `/config` in tmpfs. It keeps only
  `NET_BIND_SERVICE`, which its binary carries as a file capability.
- The worker's image is pulled by its digest in the candidate and the nightly.

- **Second reading** (an automated second context) found three defects, all fixed:
  - the image SBOM's root lost its `bom-ref`, which left its dependency graph dangling;
  - the Bridge itself was missing from the image SBOM;
  - four packages are absent from the root lock: the connectors' native optionals, which the root replaces with a
    stand-in, and OpenTelemetry's API. These were resolved at generation and never checked. They are now pinned in
    `OUTSIDE_ROOT`, and a move fails the check.
- The `qualify` workflow on a branch still builds its own image; only the candidate carries one.

→ next: Claude · the Field Kit v2 and `tools/release/provenance.mjs` (the rest of plan §6)
