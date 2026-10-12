## 4.1.20 PR 1a: the backup split before its contract changes

- Plan §6.0, before PR 1b changes the backup. The first commit adds `tests/bridge-backup-characterization.test.ts` on
  the code as it was and pins:
  - the messages of ten refused files;
  - the backup and restore command lines, with their codes and lines;
  - the envelope's keys, counts and digest, and its canonical hash with the dates and version aside;
  - the version a backup names.
- The second commit moves `bridge/src/backup.ts` to `bridge/src/backup/`, as six modules: `schema`, `canonical`,
  `files`, `snapshot`, `restore`, and `index` as the public face.
  - Every former line is kept, except one: `bridgeVersion()` looks for the repository's `package.json` one folder
    further up. The packed Bridge is one bundle (`src/cli.mjs`) and still reads its own package's version first.
  - The characterization passes before and after.
  - Three types and one helper are no longer exported, since nothing outside the code used them (knip).
- Found on the way: `tests/boundaries.test.ts` read only the top level of `bridge/src` and refused every `../` import.
  - A sub-folder would have escaped the Bridge's layers check.
  - It now walks every sub-folder, and a relative import must resolve inside `bridge/src` or the shared protocol.
  - A forbidden import placed in `backup/files.ts` makes it fail.
- No mutation set changes in this PR: `bridge/src/backup/*` enters `reality-store` in PR 1b, after PR 2a.

→ next: Claude · PR 2a (Postgres-isolated tests, shards, one generated matrix, structured exemptions)
