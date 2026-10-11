### Changes

- **The Bridge and the connectors ship with their lock** (4.1.19): `npm-shrinkwrap.json` inside each archive, made
  from locks kept in the repository (`scripts/locks/`, `npm run locks`, every version the root lock's). An install
  of either archive resolves nothing. A lock that no longer fits its manifest stops the pack.
- **The Bridge's qualification image is reproducible and traceable** (4.1.19):
  - `npm ci` from the image's own lock, with `pg` and OpenTelemetry's API at exact versions;
  - built once by the candidate and saved with its config digest, OCI manifest digest and archive SHA-256;
  - loaded and checked by `deployment-smoke` (`ops:qualify --image-from=`), then published by the release as it was
    qualified, with its identities and SBOM.
- **Five CycloneDX SBOMs, made by the candidate** (4.1.19): one each for the engine, `create-web-scumm`, the Bridge,
  the connectors and the image. Each is made from what its archive holds, and the release no longer installs anything
  to make one.
- **The qualification proxy runs unprivileged** (4.1.19): Caddy runs as the operator's uid, read-only, with bounded
  tmpfs. The worker's image is pulled by its digest.
