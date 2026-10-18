## 4.2.1: the survivors of `studio-ops` read

- **Measured on main** (run 39093185782): 115 of 181 mutants killed, 66 survivors.
- **Killed by tests** (`tests/studio-journal-mutants.test.ts`, `tests/studio-durable-mutants.test.ts`): hosted mode on
  SQLite (off by default; a first import kept in the blobs; the folder follows the head; repair counts what it
  rewrote; an empty head never empties a folder); deletions; a retried aborted id; an unchanged base; an interrupted
  operation whose revision does not follow the head; an interrupted deletion rolled forward; no dot-files, folders
  or symbolic links; a size or a time that moved; paths outside the game; an expired, fenced or missing lease; the
  wait for another writer and a fence that grows; the Postgres clock expression; durable removals, text and bytes,
  the sweep of a missing folder.
- **Named** in `docs/dev/mutants.json` (13): boundaries in the same millisecond (the wait for a lease), a
  deletion that deletes nothing, directory fsync errors that only Windows raises, a Buffer copied, one write call;
  after the second reading, a folder's descriptor closed (counted in /dev/fd), the cache's stated limit and a lease
  ending in the millisecond of the check (the database clock pinned) are killed by tests instead.
- **Result** (local run): 168 of 181 killed, 13 explained, none left. `studio-ops` is gated; `studio-auth` stays
  measured until its survivors are read.
