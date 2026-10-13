# 0023 · A backup says what it holds; a restore says its mode (4.1.20)

**Context.** Schema 3 (ADR 0021) has two gaps.
- Its digest covers the payload only. The backend, the SQL schema version, the Bridge version and the dates can change
  without breaking it.
- It does not say whether it holds the whole store. The speedrun quota (`run_quota`, migration 0004) was in no family,
  so it was not exported, restored or compared.

`restore --force` replaced what the file clashed with and kept the rest, and nothing in its name said it would not
make the store the file. A file from a journal re-labelled `sqlite` would have looked complete. A destructive restore
built on it could have deleted runs and daily records that the file never held.

**Decision** (D36, plan §6.1–6.3).

1. **Schema 4: the envelope under its digest.** The SHA-256 covers the canonical text of everything but `format`,
   `schema` and `digest`: the Bridge, the store (kind, SQL schema), `completeness`, the dates, the counts and the
   payload.
   - The reader checks strict ISO dates, `endedAt ≥ startedAt`, a SemVer version (or `unknown`), and a completeness
     that fits the backend.
   - **The digest is an integrity check against a file changed or truncated by accident, not a signature.** Whoever
     can change the file can compute it again. This ADR, REALITY-OPS and `restore`'s usage line say so.
2. **Completeness, decided under the digest.**
   - A SQL store writes `whole-store`: the families `tenants`, `runs`, `daily` and `run-quotas`, and the control
     families `schema-migrations` and `maintenance`, which are never restored.
   - The journal or memory writes `tenants-only`.
   - A registry (`bridge/src/backup/tables.ts`) classes every table the migrations create as `backed-up`, `control`
     or `explicit-ephemeral`. A test applies the migrations on SQLite and Postgres and fails on a table it does not
     name.
3. **The quota is a family.** It is exported, counted, restored and compared, by its tenants.
4. **A restore always says its mode.** Without `--mode`, nothing is restored (exit code 2).
   - `merge` is 4.1.19's restore, kept, for the families the file speaks for (schema 4 says them: a `tenants-only`
     file speaks for no run and no quota): refused on a conflict without `--force`; with it, the file's families replace
     what they clash with, and what the file does not speak of stays. Schemas 1 to 4.
   - `replace-store` makes the store the file. In one transaction, every table but the control ones is emptied, the
     file is written, and the store is read back as the file and nothing more. It takes only a schema 4 `whole-store`
     file of the destination's SQL schema, with `--yes-replace-store`.
   - `replace-store` first writes a safety backup of the store to `--safety-out`: a path that must not exist and is
     not a link, written to a private file, flushed, then linked to its name, which never replaces an existing name.
     The safety backup is read back and checked, or nothing is deleted. Its path is said in every outcome.
5. Schemas 1 to 3 stay readable, for `merge` only.
6. **Maintenance, by leases in the store** (4.1.20 PR 1c). Migration 0005 adds the `maintenance` table: one row per
   lease, `serving` or `exclusive`, and at most one exclusive (a partial unique index).
   - `serve` and every writing command hold `serving`. `restore` and a migration down take `exclusive`.
   - A live lease in the way is refused at once and named, never waited for. An expired lease is deleted in the same
     transaction.
   - Every time is the database's: `clock_timestamp()` on Postgres, `unixepoch('subsec')` on SQLite, in epoch ms,
     read once per lease.
   - On Postgres an advisory lock rides beside the lease, on a dedicated connection: shared for serving, exclusive for
     a restore, tried for `--lock-timeout` and never waited for longer, taken before the lease everywhere.
   - A lease lost (not renewed, or its lock's connection dropped) holds the store's writes: they answer 503 and
     `/readyz` fails until a new lease is taken. A restore checks that its lease still holds just before its commit,
     and rolls back if it does not.
   - The protocol is cooperative: a Bridge older than 4.1.20 takes no lease, so UPGRADING asks that every older
     instance be stopped before the first restore. Below schema 5 there is no lease table: those migrations run under
     the dialect's lock only.

**Consequences.**
- A script of 4.1.19 adds `--mode=merge` (UPGRADING §32).
- Two backups of one store no longer share a digest, since it covers their dates. A test compares payloads.
- `bridge/src/backup/*` enters the gated mutation set `reality-store`; it was in none.
- A restore requires maintenance: no live writer (point 6).
- A PID file, a lease without the database's clock and a wait for leases to expire were rejected: the first locks
  nothing across hosts, the second trusts each instance's clock, and the third makes a restore's outcome depend on
  timing.
- The memory envelope of a large backup is measured on a runner by the candidate (PR 3).

**Rejected.**
- A `--force` that grows into a mirror: the same flag would mean two things.
- `replace-store` from a schema 3 file: nothing under its digest says that it holds every family.
- A default mode: a store that turns out not to be empty at the moment of the restore would change the outcome.
