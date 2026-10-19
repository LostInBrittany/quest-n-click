## 4.2.2 PR 7: backup, restore, the journal shipped, the collection

- **The backup** (`studio-server/src/ops/backup.ts`): every table of the migrations kept or skipped with why (a test
  reads the migrations; an unknown table refuses the backup); the kept tables read in one read-only transaction,
  sorted, digested; the blobs they name listed (the head, every operation's before and after, the previews, builds and
  prepared sets); the migrations' version recorded. The restore: into an empty project of the same schema only, every
  blob checked first, every row in one transaction.
- **The journal shipped** (`ops/ship.ts`): after each confirmed operation and at start, the operations past the
  watermark (`studio_meta.shipped`) copied in order to `journal/<epoch>/<rev>.json`; a failure logged and tried again
  at the next operation; the RPO (the age of the oldest operation not shipped) in `/readyz`. The replay after a
  restore applies the segments past the backup's revision, in order, and stops at a gap.
- **The collection** (`ops/gc.ts`): what the rows name is kept (the same reading as a backup's), and what is younger
  than a day; the worker's staging older than an hour too; listed by default, deleted with `--delete`. The blob
  stores can list and remove (fs; S3 through ListObjectsV2, `S3.list`).
- **Commands**: `backup <file>`, `restore <file> [--replay]`, `gc [--delete]`; the drill in STUDIO-SERVER (en, fr).
- **Tests**: `tests/studio-backup.test.ts` (the registry against the migrations; restore then replay gives the same
  head and the project opens; a backup altered, a project not empty, a blob missing, another schema refused; the RPO
  while the bucket is away; a replay stopped at a gap; the collection's grace, its deletion, the staging), and on
  Postgres and S3 in CI (`tests/studio-server.test.ts`: the same round trip, the bucket listed).

→ next: Claude (PR 8: the gates, then the release)
