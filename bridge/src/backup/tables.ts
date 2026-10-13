// Every table the Bridge's migrations create, classified (4.1.20 PR 1b, ADR 0023, plan §6.1): `backed-up` (the
// family a schema 4 backup carries it in), `control` (never restored: `schema_migrations` describes the destination,
// `maintenance` holds the operation's lock), or `explicit-ephemeral` (emptied by `replace-store`, untouched by `merge`).
// tests/bridge-backup-v4.test.ts applies every migration on SQLite and Postgres and fails on a table not named here:
// a future migration cannot make `whole-store` untrue in silence.
export type TableKind = 'backed-up' | 'control' | 'explicit-ephemeral';
export const TABLES: Record<string, { kind: TableKind; family?: 'tenants' | 'runs' | 'daily' | 'run-quotas' }> = {
  players: { kind: 'backed-up', family: 'tenants' },
  pairings: { kind: 'backed-up', family: 'tenants' },
  signals: { kind: 'backed-up', family: 'tenants' },
  revoked_tokens: { kind: 'backed-up', family: 'tenants' },
  signing_keys: { kind: 'backed-up', family: 'tenants' },
  quarantine: { kind: 'backed-up', family: 'tenants' },
  runs: { kind: 'backed-up', family: 'runs' },
  daily_kv: { kind: 'backed-up', family: 'daily' },
  run_quota: { kind: 'backed-up', family: 'run-quotas' },
  schema_migrations: { kind: 'control' },
};

/** The tables a `replace-store` empties before it writes the snapshot: everything but the control tables. */
export const REPLACED = Object.keys(TABLES).filter((t) => TABLES[t]!.kind !== 'control');
