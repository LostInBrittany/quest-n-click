## 4.1.20 PR 1b: a backup says what it holds, a restore says its mode (ADR 0023)

- Plan §6.1–6.3, D36. Split from the plan's PR 1b: the maintenance protocol (migration 0005, the leases of every store
  writer, its requirement in `restore`) is PR 1c. Until it lands, REALITY-OPS's rule stands: stop the instances during
  a restore. The memory envelope of a large backup (§6.5) is measured on a runner by the candidate, in PR 3.
- Schema 4:
  - the SHA-256 of the canonical envelope (`format`, `schema`, `digest` aside);
  - strict ISO dates, `endedAt ≥ startedAt`, a SemVer version (or `unknown`);
  - a `completeness` that fits the backend: `whole-store` for SQL, `tenants-only` for the journal or memory;
  - the speedrun quota (`run_quota`) as a family, exported, counted, restored and compared;
  - the table registry `bridge/src/backup/tables.ts`, with a test that lists the real tables on SQLite and Postgres.
- `restore --mode=merge | replace-store`, with no default:
  - `--force` alone is refused;
  - `replace-store` needs `--yes-replace-store`, `--safety-out` (a new path, not a link, written through a link that
    never replaces a name, read back) and a schema 4 `whole-store` file of the destination's SQL schema;
  - in one transaction it empties every table but the control ones, writes the file, and checks the store holds it
    and nothing more;
  - a schema 3 file is refused for it and still accepted for `merge`.
- Tests:
  - tests/bridge-backup-v4.test.ts on SQLite and Postgres;
  - the characterization of PR 1a pinned again on purpose (schema 4 messages, envelope, lines);
  - the existing tests gain `--mode=merge`;
  - two backups of one store are compared by payload, since the digest covers their dates.
- `bridge/src/backup/*` joins the gated set `reality-store`, which goes to 2 shards, with the backup tests; a test
  keeps every backup file in a gated set.

→ next: Claude · PR 1c (maintenance: migration 0005, leases); PR 2b (connectors-edge, the badges)
