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

- **Second automated reading context**, all taken in:
  - **P0:** an intent a dead process left was recovered only at opening. A live process could adopt the half-written
    state as an `external` operation with the same revision, and a later recovery moved the head backwards. Now
    every operation first settles under the lease: logged intents are rolled forward, then the whole disk is
    adopted. `confirm` refuses anything but head + 1, and live operations are unique per revision (partial index).
  - **P1:**
    - the lease is renewed while an operation runs and fenced; the intent and the confirmation check it in their
      transaction (`LeaseLostError`);
    - files are hashed again after the guard, so an editor's save during the check is a 409;
    - the guard's baseline stays true, since the whole disk is adopted before each operation (hashes recomputed only
      when size or mtime moved).
  - **P2:**
    - the room writers pass the text they computed from (`from`);
    - staging falls back to copies across file systems;
    - a real I/O error of a directory fsync is no longer swallowed;
    - a dead writer's id, retried, is answered `{ recovered: true }`.
  - **Tests added:** a second live process meets a dead intent; a writer whose lease was taken over cannot log; a
    file saved during the guard is a 409.
  - **Noted, not done:**
    - fsync is not F_FULLFSYNC on macOS;
    - Postgres's lease and its own database come with PR 4;
    - text edits now pay the guard (one look-lines test needed a longer timeout). The p95 is measured before the
      release.

→ next: Claude (PR 3, a single entry for every writer)
