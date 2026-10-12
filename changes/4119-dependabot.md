### Changes

- **Dependencies of 11 October** (after 4.1.19): Playwright 1.64, the MCP SDK 1.32.1, knip 6.40, `cross-env` 10 (a
  CLI here; Node 20+, which the project's 22.12 meets); the workflows' actions pinned to `checkout` 7.0.1,
  `setup-node` 7.1.0, `upload-artifact` 7.0.2, `download-artifact` 8.0.2 (a hash mismatch now fails, as the release
  wants) and `attest-build-provenance` 4.2.2 (a wrapper on `actions/attest`), each SHA checked against its tag.
- **`@types/node` stays on the oldest supported Node** (22): Dependabot no longer proposes its majors; Node 26's types
  reject code that is right on 22.
