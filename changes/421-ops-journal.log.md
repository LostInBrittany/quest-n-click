## 4.2.1 PR 2: the operation journal, the unified guard (local mode)

Branch: feature/421-ops-journal (stacked on #128) · Plan §3.8, §4, row 2

- **Journal** (`studio-server/src/ops/journal.ts`). Each operation:
  - checks the client's base (409) and the hashes it read (409);
  - is guarded;
  - stores its "after" blobs;
  - logs an intent;
  - writes each file durably (`durable.ts`: temp, fsync, rename, fsync of the directory);
  - is confirmed with its revision and recorded response. A retry with the same id gets that response.
- **Opening the journal:**
  - rolls forward interrupted intents, file by file from the blobs;
  - refuses with maintenance (503) when a file is neither side;
  - sweeps temporaries;
  - adopts outside changes as `external` operations.
- **One writer per project across processes:** a lease row on the database's clock, refused after a bounded wait.
- **SQLite and migrations:** reused from the Bridge without widening its store:
  - `openSqliteDb` is extracted from `SqliteRealityStore.open` (neutral);
  - `migrate()` gains a `dir` option, used by `studio-server/migrations/`.
- **Core:**
  - every writer goes through the journal (`write`);
  - the guard builds a staging folder of hard links with the changed files, validates it, and compares with the
    baseline of the current revision (P3), so nothing is written and then taken back;
  - undo and redo are operations, and one step covers every file;
  - notes and the storyboard stay out of undo, as before.
- **Deliberately later:**
  - the hosted journal (Postgres plus Cellar, reads by revision): PR 4;
  - the `Executor` with an emptied environment and the separate worker: PR I. The guard still imports in process, as
    the dev server did.

→ next: Claude (PR 3, a single entry for every writer)
