// The Studio Server's backup and restore (4.2.2 PR 7, plan §2.7, G7), on the pattern of the Bridge's (ADR 0021,
// D36): one logical snapshot of the tables that hold the project, read in one read-only transaction; a registry says,
// for every table of the migrations, whether it is kept or why not (a table neither kept nor skipped refuses the
// backup: a new table is never forgotten); the blobs the kept rows name are listed, not copied (they are the bucket's,
// content-addressed, never rewritten). A restore goes into an empty project only, after checking that every blob is
// there; the journal's shipped segments then bring it from the backup's revision to the last one shipped.
import { createHash } from 'node:crypto';
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import type { BlobStore } from './blobs';
import { ABSENT } from './durable';

/** Kept: the project. Skipped (with why): what a restore must not bring back, or rebuilds by itself. */
export const TABLES: Record<string, 'kept' | { skipped: string }> = {
  studio_meta: 'kept',
  studio_ops: 'kept',
  studio_files: 'kept',
  studio_users: 'kept',
  studio_members: 'kept',
  studio_invitations: 'kept',
  studio_audit: 'kept',
  studio_undo: 'kept',
  studio_health: 'kept',
  studio_previews: 'kept',
  studio_builds: 'kept',
  studio_prepared: 'kept',
  studio_lease: { skipped: "the journal's writer lease: the restored instance takes its own" },
  studio_service: { skipped: 'the service lease: the restored instance takes its own' },
  studio_spans: { skipped: "the spans' leases: nobody holds a span after a restore" },
  studio_sessions: { skipped: 'the sessions: a restore logs everyone out' },
  studio_preauth: { skipped: 'logins under way' },
  studio_seen_jti: { skipped: 'back-channel logouts seen: their tokens have expired by then' },
  studio_requests: { skipped: "answers kept for a client's retry (7 days)" },
  studio_play_tickets: { skipped: "the game origin's tickets (60 s)" },
  studio_play_sessions: { skipped: "the game origin's sessions (they depend on the Studio's)" },
};

export const BACKUP_FORMAT = 'web-scumm-studio-backup';

export interface StudioBackup {
  format: typeof BACKUP_FORMAT;
  v: 1;
  at: number;
  epoch: string;
  revision: number;
  /** The migrations' version it was made at: a restore needs the same. */
  schema: number;
  /** The kept tables' rows, each table's sorted. */
  tables: Record<string, Record<string, unknown>[]>;
  /** The blobs the rows name (the head, every operation's before and after, the previews, builds, prepared sets). */
  blobs: string[];
  /** sha256 of the canonical tables: a backup altered or cut short is refused. */
  digest: string;
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v as object)
            .sort()
            .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
        )
      : v;
const digestOf = (tables: StudioBackup['tables']) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(tables)))
    .digest('hex');

/** The tables the migrations made: every one must be in the registry. */
async function tablesIn(q: SqlQuery, dialect: SqlDb['dialect']): Promise<string[]> {
  const rows =
    dialect === 'postgres'
      ? await q.all(
          "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE 'studio\\_%'",
        )
      : await q.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'studio\\_%' ESCAPE '\\'");
  return rows.map((r) => String(r.name)).sort();
}

/** The blobs the kept rows name. */
export function referencedBlobs(tables: StudioBackup['tables']): Set<string> {
  const out = new Set<string>();
  const add = (h: unknown) => {
    if (typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)) out.add(h);
  };
  for (const r of tables.studio_files ?? []) add(r.blob);
  for (const r of tables.studio_ops ?? [])
    for (const e of JSON.parse(String(r.effects)) as { before: string; after: string }[]) {
      add(e.before);
      add(e.after);
    }
  for (const r of tables.studio_previews ?? [])
    if (r.manifest) for (const h of Object.values(JSON.parse(String(r.manifest)) as Record<string, string>)) add(h);
  for (const r of tables.studio_prepared ?? [])
    for (const h of Object.values(JSON.parse(String(r.manifest)) as Record<string, string>)) add(h);
  for (const r of tables.studio_builds ?? [])
    if (r.manifest) for (const [, h] of (JSON.parse(String(r.manifest)) as { files: [string, string][] }).files) add(h);
  out.delete(ABSENT);
  return out;
}

/** One snapshot of the project, in one read-only transaction. */
export async function backupOf(db: SqlDb, now = Date.now()): Promise<StudioBackup> {
  return db.tx(
    undefined,
    async (q) => {
      const present = await tablesIn(q, db.dialect);
      const unknown = present.filter((t) => !(t in TABLES));
      if (unknown.length)
        throw new Error(`backup: the tables ${unknown.join(', ')} are neither kept nor skipped (ops/backup.ts)`);
      const tables: StudioBackup['tables'] = {};
      for (const t of present.filter((t) => TABLES[t] === 'kept')) {
        const rows = (await q.all(`SELECT * FROM ${t}`)).map((r) => ({ ...r }));
        tables[t] = rows.sort((a, b) => (JSON.stringify(canonical(a)) < JSON.stringify(canonical(b)) ? -1 : 1));
      }
      const meta = Object.fromEntries((tables.studio_meta ?? []).map((r) => [String(r.key), String(r.value)]));
      const [s] = await q.all('SELECT MAX(version) AS v FROM schema_migrations');
      return {
        format: BACKUP_FORMAT,
        v: 1 as const,
        at: now,
        epoch: meta.epoch ?? '',
        revision: Number(meta.revision ?? 0),
        schema: Number(s?.v ?? 0),
        tables,
        blobs: [...referencedBlobs(tables)].sort(),
        digest: digestOf(tables),
      };
    },
    { readOnly: true },
  );
}

/** A backup read back: its format, its digest, its blobs' names as its rows say. Throws otherwise. */
export function checkBackup(input: unknown): StudioBackup {
  const b = input as StudioBackup;
  if (!b || b.format !== BACKUP_FORMAT || b.v !== 1 || !b.tables || typeof b.tables !== 'object')
    throw new Error('restore: not a Studio Server backup');
  if (digestOf(b.tables) !== b.digest)
    throw new Error('restore: the backup does not match its digest (altered or cut)');
  for (const t of Object.keys(b.tables))
    if (TABLES[t] !== 'kept') throw new Error(`restore: the backup holds a table that is not kept: ${t}`);
  return b;
}

/**
 * Restores a checked backup into an empty project (its tables migrated, none of the kept ones holding a row): every
 * blob it names checked first, then every row in one transaction. Never over a project that holds anything.
 */
export async function restoreInto(db: SqlDb, blobs: BlobStore, b: StudioBackup): Promise<{ rows: number }> {
  const missing: string[] = [];
  for (const h of referencedBlobs(b.tables)) if (!(await blobs.has(h))) missing.push(h);
  if (missing.length)
    throw new Error(`restore: ${missing.length} blob(s) the backup names are missing (first: ${missing[0]})`);
  return db.tx('studio', async (q) => {
    const [s] = await q.all('SELECT MAX(version) AS v FROM schema_migrations');
    if (Number(s?.v ?? 0) !== b.schema)
      throw new Error(`restore: the backup is of schema ${b.schema}, this server's is ${Number(s?.v ?? 0)}`);
    for (const t of Object.keys(TABLES).filter((t) => TABLES[t] === 'kept')) {
      const [r] = await q.all(`SELECT COUNT(*) AS n FROM ${t}`);
      if (Number(r?.n ?? 0) > 0)
        throw new Error(`restore: the project is not empty (${t} holds rows): restore into a new one`);
    }
    let rows = 0;
    for (const [t, list] of Object.entries(b.tables))
      for (const row of list) {
        const cols = Object.keys(row);
        await q.run(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
          cols.map((c) => row[c]),
        );
        rows++;
      }
    return { rows };
  });
}
