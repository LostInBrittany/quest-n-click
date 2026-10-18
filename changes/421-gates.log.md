## 4.2.1 PR 9 (first part): the Studio Server's gates

Branch: ci/421-gates (stacked on PR 8's first part) · Plan §7 row 9, §11

- **CI job `studio-hosted`** (gate `studioHosted`, opened by `studio-server/`, its hosted tests and
  `ops/studio/ci/`; in `pr-gate`): the hosted tests against a Postgres 16 service and S3. S3 is SeaweedFS
  (`mirror.gcr.io/chrislusf/seaweedfs`, pinned by digest): its gateway checks SigV4 and presigned URLs as Cellar
  does, and MinIO no longer publishes free images. Its test identity is `ops/studio/ci/seaweedfs-s3.json`. Run here
  against the same image: 41 tests passed (`studio-server`, `studio-worker`, `studio-collab`).
- **Coverage:** `studio-server/src/**` measured; floors on the trust boundaries (journal, spans, gate, provider, auth
  routes and store, configuration, HTTP, leases, live stream, game's origin, remote executor, jobs, snapshots), two
  points under the measure. Global coverage rose (lines 75.7 %, branches 70.7 %).
- **Mutation:** two sets, `studio-ops` and `studio-auth`, measured (`docs/dev/MUTANTS.md`).
- **Left for the second part** (after the client, PR 7): the release packages `web-scumm-studio-server` and
  `-worker` with their locks and SBOM, `studio-install-smoke`, a real Keycloak in CI, the passes `studio-hosted` and
  `studio-collab` (bound to those packages), and the two sets gated once their survivors are read.

→ next: Claude (PR 7, the client, after the mock-ups)
