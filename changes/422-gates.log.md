## 4.2.2 PR 8: the gates

- **Passes** (`tools/field/schema.ts`, `docs/dev/surfaces.json`): `studio-preview` and `studio-assets-hosted`, asked
  from 4.2.2 (`PASS_SINCE`), bound to the engine's and the Studio Server's archives, both after `studio-hosted`; a
  4.2.1 release is not asked them (`tests/field-kit.test.ts`, `tests/field-carry.test.ts`).
- **Mutation** (`tools/mutation-sets.ts`): the set `studio-workshop`, its tests the workshop's own
  (`tests/studio-{undo,health,previews,builds,prepared,backup}.test.ts`, and `studio-client` for the previews' serving), in `MEASURED`: run every night and on demand,
  gating nothing until its survivors are read (as `studio-ops` and `studio-auth` in 4.2.1).
- **CI**: the previews, builds and restore run in `check` (SQLite) and in `studio-hosted` (Postgres and S3: the build,
  the prepare on the worker, the backup's round trip with the journal shipped and replayed).

→ next: Claude (the set measured on a runner, then the release)
