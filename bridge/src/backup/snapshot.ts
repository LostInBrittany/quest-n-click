// A backup (4.1.19, ADR 0021): one logical snapshot of the whole store, read in one read-only transaction and written
// with its envelope (schema 3). Split from `bridge/src/backup.ts` (4.1.20 PR 1a).
import type { RealityStore, TenantExport } from '../store-async';
import { exportTenantIn, SqlRealityStore } from '../store-sql';
import { byCodeUnit, countsOf, normalRow, normalTenant, payloadDigest, runKey, withoutCapabilities } from './canonical';
import { bridgeVersion } from './files';
import {
  BACKUP_FORMAT,
  type BackupPayload,
  BackupError,
  type BackupV3,
  DAILY_COLUMNS,
  MAX_BACKUP_ROWS,
  RUN_COLUMNS,
} from './schema';

export const TENANTS_SQL =
  'SELECT tenant_id FROM players UNION SELECT tenant_id FROM signals UNION SELECT tenant_id FROM signing_keys UNION SELECT tenant_id FROM revoked_tokens UNION SELECT tenant_id FROM pairings UNION SELECT tenant_id FROM quarantine UNION SELECT tenant_id FROM runs';
const COUNTED = ['players', 'signals', 'signing_keys', 'revoked_tokens', 'pairings', 'quarantine', 'runs', 'daily_kv'];

/**
 * Every family of a SQL store read in one read-only transaction (Postgres: REPEATABLE READ READ ONLY; SQLite in WAL:
 * the snapshot of the transaction's first read): tenants, runs and daily records are one instant. The rows are
 * counted first, inside the same snapshot, and a store above `maxRows` is refused before it is loaded.
 */
async function sqlSnapshot(
  store: SqlRealityStore,
  maxRows: number,
): Promise<{ payload: BackupPayload; schema: number }> {
  return store.db.tx(
    undefined,
    async (q) => {
      let rows = 0;
      for (const t of COUNTED) rows += Number((await q.all(`SELECT COUNT(*) AS n FROM ${t}`))[0]?.n ?? 0);
      if (rows > maxRows)
        throw new BackupError(
          `the store holds ${rows} rows, more than ${maxRows} (--max-rows=); use pg_dump or the provider's snapshots`,
        );
      const [v] = await q.all('SELECT MAX(version) AS v FROM schema_migrations');
      const ids = (await q.all(TENANTS_SQL)).map((r) => String(r.tenant_id)).sort();
      const tenants: TenantExport[] = [];
      // Every list in code-unit order, never the database's collation: the same store gives the same file from
      // SQLite and from Postgres.
      for (const id of ids) tenants.push(normalTenant(await exportTenantIn(q, id)));
      const runs = (await q.all(`SELECT ${RUN_COLUMNS.join(', ')} FROM runs`))
        .map((r) => normalRow(r, RUN_COLUMNS))
        .sort(byCodeUnit(runKey));
      const daily = (await q.all(`SELECT ${DAILY_COLUMNS.join(', ')} FROM daily_kv`))
        .map((r) => normalRow(r, DAILY_COLUMNS))
        .sort(byCodeUnit((r) => String(r.k)));
      return { payload: { tenants, runs, daily }, schema: Number(v?.v ?? 0) };
    },
    { readOnly: true },
  );
}

/** A backup of the whole store (schema 3). The journal holds one tenant read at once: its export is one instant. */
export async function makeBackup(store: RealityStore, o: { maxRows?: number } = {}): Promise<BackupV3> {
  const startedAt = new Date().toISOString();
  let payload: BackupPayload;
  let schema: number | null = null;
  if (store instanceof SqlRealityStore) ({ payload, schema } = await sqlSnapshot(store, o.maxRows ?? MAX_BACKUP_ROWS));
  else {
    const tenants: TenantExport[] = [];
    for (const t of await store.tenants()) tenants.push(withoutCapabilities(await store.exportTenant(t)));
    payload = { tenants, runs: [], daily: [] };
  }
  return {
    format: BACKUP_FORMAT,
    schema: 3,
    bridge: { version: bridgeVersion() },
    store: { kind: store.kind, schema },
    startedAt,
    endedAt: new Date().toISOString(),
    counts: countsOf(payload),
    payload,
    digest: { alg: 'sha256', value: payloadDigest(payload) },
  };
}
