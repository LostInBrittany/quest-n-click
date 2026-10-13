## 4.1.20 PR 1c: maintenance leases, a restore alone or refused (ADR 0023, point 6)

- Plan §6.4, D36, the second half of the plan's PR 1b.
- Migration 0005 adds `maintenance`: one row per lease, `serving` or `exclusive`, at most one exclusive.
- `bridge/src/maintenance.ts` provides `takeLease` and `keepLease`:
  - one transaction under the `maintenance` lock key: expired leases deleted, a live lease in the way refused at once
    and named, the database clock read once (`clock_timestamp()`, `unixepoch('subsec')`, epoch ms);
  - renewed every third of the lease's life;
  - a lease lost holds the store's writes (`WritesHeldError`, a `StoreBusyError`, so 503) and fails `ping`
    (`/readyz`) until a new lease is taken.
- On Postgres, an advisory lock rides beside the lease, on a dedicated connection: shared or exclusive, tried for
  `--lock-timeout` with `pg_try_*`, taken before the lease. A connection that drops is reported (`lost`) and given
  back to the pool with its error, so the pool drops it instead of handing it out again (found here: the pool handed
  the dead client back and no lease could be taken again).
- `openStore`:
  - `serving` by default for any store that may be written;
  - `exclusive` for `restore`;
  - none for `doctor` and below schema 5;
  - `serve` (30 s lease) refuses to start while a restore holds the store;
  - `migrate --schema=N` takes `exclusive` going down and `serving` going up.
- The restore checks its lease just before the commit (`stillHeld`).
- The raw database (`leaseDb`) serves the leases only; `db` is the write guard.
- ops-qualify: the 4.1.17 store is now migrated to schema 5 in one step.
- Tests: tests/bridge-maintenance.test.ts, on SQLite and Postgres.
  - A real crash on Postgres is simulated with `pg_terminate_backend`.
  - Writes are held while a restore holds the store or the lock drops, and come back once a lease is retaken.
  - `restore` and `migrate` down are refused while a Bridge serves; `serve` is refused while a restore runs.
  - A restore whose lease is lost before its commit is rolled back.
  - The test runs three times in a row without a failure.

→ next: Claude · PR 2b (connectors-edge, the badges)
