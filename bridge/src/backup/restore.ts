// A restore (4.1.19, ADR 0021): a checked payload written into a SQL store in one transaction, read back before the
// commit, audited after it. Split from `bridge/src/backup.ts` (4.1.20 PR 1a). Two modes since 4.1.20 PR 1b (ADR 0023):
// `merge` (4.1.19's restore: the file's families replace what they clash with, what the file does not speak of stays)
// and `replace-store` (every table but the control ones emptied, the snapshot written: the store is the file).
import { exportTenantIn, importTenantIn, type Row, type SqlQuery, type SqlRealityStore } from '../store-sql';
import { byCodeUnit, normalRow, normalTenant, runKey, stableJson } from './canonical';
import { type BackupPayload, DAILY_COLUMNS, QUOTA_COLUMNS, RUN_COLUMNS } from './schema';
import { TENANTS_SQL } from './snapshot';
import { REPLACED } from './tables';

export type RestoreOutcome =
  | { ok: true; tenants: number; runs: number; daily: number; quotas?: number }
  | { ok: false; why: string };
export type RestoreMode = 'merge' | 'replace-store';
export interface RestoreOptions {
  force: boolean;
  /** The file speaks for its tenants' runs (schema 2 and later). */
  carriesRuns: boolean;
  /** The file speaks for its tenants' quotas (schema 4). */
  carriesQuotas?: boolean;
  mode?: RestoreMode;
  /** Why the store may no longer be written (its maintenance lease lost, 4.1.20 PR 1c): checked before the commit. */
  stillHeld?: () => string | undefined;
}
const quotaKey = (r: Row) => `${String(r.tenant_id)}\u0000${String(r.client_key)}`;
/** The tenants whose quotas a file speaks for: all its tenants when it carries quotas, its quotas' own otherwise. */
const quotaTenantsOf = (p: BackupPayload, carries: boolean) =>
  [
    ...new Set([
      ...(carries ? p.tenants.map((t) => t.tenantId) : []),
      ...(p.quotas ?? []).map((r) => String(r.tenant_id)),
    ]),
  ].sort();

/** Raised inside the transaction when the store does not read back what was written: the transaction rolls back. */
class RestoreMismatch extends Error {}

/**
 * Restores a checked payload into a SQL store, all or nothing, in one transaction:
 * 1. without `force`, every conflict (a tenant, a run of its tenants, a daily key already held) is found before the
 *    first write, and the restore is refused;
 * 2. with `force`, the tenants, their runs and the daily keys are deleted and written again inside the transaction;
 * 3. before the commit, each tenant is exported again and compared with the file, and the runs and daily records are
 *    counted and read back: a difference rolls everything back.
 * `replace-store` empties every table but the control ones first and writes the file (a whole-store schema 4 file:
 * the command line checks it), then reads back that the store holds the file and nothing else.
 */
export async function restoreBackup(
  store: SqlRealityStore,
  p: BackupPayload,
  o: RestoreOptions,
): Promise<RestoreOutcome> {
  const replace = o.mode === 'replace-store';
  const quotaTenants = quotaTenantsOf(p, o.carriesQuotas ?? false);
  const tenantIds = p.tenants.map((t) => t.tenantId);
  // The tenants whose runs the file speaks for: every tenant of a file that carries runs (schema 2 and 3: a tenant
  // without runs there had none), only the runs' own tenants otherwise (a schema 1 file never knew of leaderboards: it
  // neither refuses over them nor deletes them).
  const runTenants = [
    ...new Set([...(o.carriesRuns ? tenantIds : []), ...p.runs.map((r) => String(r.tenant_id))]),
  ].sort();
  const dailyKeys = p.daily.map((r) => String(r.k));
  let committing = false;
  try {
    return await store.db.tx('backup:restore', async (q: SqlQuery): Promise<RestoreOutcome> => {
      // replace-store: nothing held is kept, so nothing clashes (one transaction: a failure leaves the store whole).
      if (replace) for (const t of REPLACED) await q.run(`DELETE FROM ${t}`);
      const held = new Set((await q.all(TENANTS_SQL)).map((r) => String(r.tenant_id)));
      const clash = tenantIds.filter((t) => held.has(t));
      let heldRuns = 0;
      for (const part of chunks(runTenants))
        heldRuns += Number(
          (await q.all(`SELECT COUNT(*) AS n FROM runs WHERE tenant_id IN (${marks(part)})`, part))[0]?.n ?? 0,
        );
      const heldDaily: string[] = [];
      for (const part of chunks(dailyKeys))
        for (const r of await q.all(`SELECT k FROM daily_kv WHERE k IN (${marks(part)})`, part))
          heldDaily.push(String(r.k));
      let heldQuotas = 0;
      for (const part of chunks(quotaTenants))
        heldQuotas += Number(
          (await q.all(`SELECT COUNT(*) AS n FROM run_quota WHERE tenant_id IN (${marks(part)})`, part))[0]?.n ?? 0,
        );
      if (!o.force && (clash.length || heldRuns || heldDaily.length || heldQuotas))
        return {
          ok: false,
          why: `the store already holds ${[
            clash.length ? `tenant(s) ${clash.slice(0, 20).join(', ')}${clash.length > 20 ? '…' : ''}` : '',
            heldRuns ? `${heldRuns} run(s) of these tenants` : '',
            heldDaily.length ? `${heldDaily.length} daily record(s)` : '',
            heldQuotas ? `${heldQuotas} quota row(s) of these tenants` : '',
          ]
            .filter(Boolean)
            .join(', ')}: restore into an empty store, or --force`,
        };
      const clashing = new Set(clash);
      for (const t of p.tenants) await importTenantIn(q, t, clashing.has(t.tenantId));
      if (o.force)
        for (const part of chunks(runTenants))
          await q.run(`DELETE FROM runs WHERE tenant_id IN (${marks(part)})`, part);
      if (o.force)
        for (const part of chunks(heldDaily)) await q.run(`DELETE FROM daily_kv WHERE k IN (${marks(part)})`, part);
      if (o.force)
        for (const part of chunks(quotaTenants))
          await q.run(`DELETE FROM run_quota WHERE tenant_id IN (${marks(part)})`, part);
      // The columns are this file's list, never the backup's keys: nothing the file says is spliced into a statement.
      const insert = (table: string, cols: readonly string[]) =>
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${marks([...cols])})`;
      for (const r of p.runs)
        await q.run(
          insert('runs', RUN_COLUMNS),
          RUN_COLUMNS.map((c) => normalRow(r, RUN_COLUMNS)[c]),
        );
      for (const r of p.daily)
        await q.run(
          insert('daily_kv', DAILY_COLUMNS),
          DAILY_COLUMNS.map((c) => normalRow(r, DAILY_COLUMNS)[c]),
        );
      for (const r of p.quotas ?? [])
        await q.run(
          insert('run_quota', QUOTA_COLUMNS),
          QUOTA_COLUMNS.map((c) => normalRow(r, QUOTA_COLUMNS)[c]),
        );
      // Read back before the commit: what decides success is checked while it can still be undone. Both sides are put
      // in the same order here (by code unit), never the database's: a collation may order ids otherwise.
      const why = (await differs(q, p, runTenants, quotaTenants)) ?? (replace ? await beyond(q, p) : undefined);
      if (why) throw new RestoreMismatch(why);
      const lost = o.stillHeld?.();
      if (lost) throw new RestoreMismatch(lost);
      committing = true;
      return {
        ok: true,
        tenants: p.tenants.length,
        runs: p.runs.length,
        daily: p.daily.length,
        ...(o.carriesQuotas ? { quotas: (p.quotas ?? []).length } : {}),
      };
    });
  } catch (e) {
    if (e instanceof RestoreMismatch) return { ok: false, why: e.message };
    // Everything was written and checked: only the commit itself failed. A lost connection there may have committed.
    if (committing) throw new RestoreUnknown((e as Error).message);
    throw e;
  }
}

/** The commit's answer was lost: the restore may or may not be in the store. */
export class RestoreUnknown extends Error {}

const marks = (xs: unknown[], from = 1) => xs.map((_, i) => `$${i + from}`).join(', ');
/** Lists of at most 500 values: well under SQLite's and Postgres' limits on a statement's parameters. */
function chunks<T>(xs: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * What the store holds that the file does not say (tenants, runs of `runTenants`, daily records, quotas of
 * `quotaTenants`); undefined if none.
 */
async function differs(
  q: SqlQuery,
  p: BackupPayload,
  runTenants: string[],
  quotaTenants: string[],
): Promise<string | undefined> {
  for (const t of p.tenants)
    if (stableJson(normalTenant(await exportTenantIn(q, t.tenantId))) !== stableJson(normalTenant(t)))
      return `tenant ${t.tenantId} does not read back as the backup holds it`;
  const back: Row[] = [];
  for (const part of chunks(runTenants))
    for (const r of await q.all(`SELECT ${RUN_COLUMNS.join(', ')} FROM runs WHERE tenant_id IN (${marks(part)})`, part))
      back.push(normalRow(r, RUN_COLUMNS));
  const want = p.runs.map((r) => normalRow(r, RUN_COLUMNS));
  back.sort(byCodeUnit(runKey));
  want.sort(byCodeUnit(runKey));
  if (stableJson(back) !== stableJson(want)) return 'the runs do not read back as the backup holds them';
  for (const r of p.daily) {
    const [b] = await q.all(`SELECT ${DAILY_COLUMNS.join(', ')} FROM daily_kv WHERE k = $1`, [r.k]);
    if (!b || stableJson(normalRow(b, DAILY_COLUMNS)) !== stableJson(normalRow(r, DAILY_COLUMNS)))
      return `the daily record ${String(r.k)} does not read back as the backup holds it`;
  }
  const quotas: Row[] = [];
  for (const part of chunks(quotaTenants))
    for (const r of await q.all(
      `SELECT ${QUOTA_COLUMNS.join(', ')} FROM run_quota WHERE tenant_id IN (${marks(part)})`,
      part,
    ))
      quotas.push(normalRow(r, QUOTA_COLUMNS));
  const wantQuotas = (p.quotas ?? []).map((r) => normalRow(r, QUOTA_COLUMNS));
  quotas.sort(byCodeUnit(quotaKey));
  wantQuotas.sort(byCodeUnit(quotaKey));
  if (stableJson(quotas) !== stableJson(wantQuotas)) return 'the quotas do not read back as the backup holds them';
  return undefined;
}

/** replace-store: anything the store holds beyond the file (a tenant, a run, a daily record, a quota); undefined if none. */
async function beyond(q: SqlQuery, p: BackupPayload): Promise<string | undefined> {
  const tenants = (await q.all(TENANTS_SQL)).map((r) => String(r.tenant_id)).sort();
  if (stableJson(tenants) !== stableJson(p.tenants.map((t) => t.tenantId).sort()))
    return 'the store holds tenants the backup does not';
  const n = async (t: string) => Number((await q.all(`SELECT COUNT(*) AS n FROM ${t}`))[0]?.n ?? 0);
  if ((await n('runs')) !== p.runs.length) return 'the store holds runs the backup does not';
  if ((await n('daily_kv')) !== p.daily.length) return 'the store holds daily records the backup does not';
  if ((await n('run_quota')) !== (p.quotas ?? []).length) return 'the store holds quotas the backup does not';
  return undefined;
}

/**
 * After the commit, a separate health reading (an audit, not the condition of success): the same comparison, in a new
 * read-only transaction. With the Bridge stopped during the restore (REALITY-OPS), a difference is a fault of the
 * backend, a P0; a Bridge left running may have written meanwhile, which the audit cannot tell apart.
 */
export async function auditRestore(
  store: SqlRealityStore,
  p: BackupPayload,
  o: { carriesRuns: boolean; carriesQuotas?: boolean; mode?: RestoreMode },
): Promise<string | undefined> {
  const runTenants = [
    ...new Set([...(o.carriesRuns ? p.tenants.map((t) => t.tenantId) : []), ...p.runs.map((r) => String(r.tenant_id))]),
  ].sort();
  const quotaTenants = quotaTenantsOf(p, o.carriesQuotas ?? false);
  return store.db.tx(
    undefined,
    async (q) =>
      (await differs(q, p, runTenants, quotaTenants)) ?? (o.mode === 'replace-store' ? await beyond(q, p) : undefined),
    { readOnly: true },
  );
}
