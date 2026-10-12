// The backup file's contract (4.1.19, ADR 0021): its format and schemas, the columns it carries, its counts, and the
// reading that checks every row before anything is written. Split from `bridge/src/backup.ts` (4.1.20 PR 1a).
import { z } from 'zod/mini';
import type { RealityStore, TenantExport } from '../store-async';
import { checkTenant } from '../store-async';
import type { Row } from '../store-sql';
import { countsOf, payloadDigest, stableJson, withoutCapabilities } from './canonical';

export const BACKUP_FORMAT = 'web-scumm-bridge-backup';
/** The largest backup file written or read by default (`--max-bytes=` changes it): 256 MiB. */
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
/** The most rows a backup loads in memory by default (`--max-rows=`): counted inside the snapshot, before reading it. */
export const MAX_BACKUP_ROWS = 2_000_000;

/**
 * The columns of `runs` and `daily_kv` a backup carries, in their canonical order (bridge/migrations/0002.up.sql). A
 * restore names only these, whatever the file says; `tests/bridge-backup.test.ts` compares them with the schema.
 */
export const RUN_COLUMNS = [
  'tenant_id',
  'id',
  'game_id',
  'category_id',
  'player',
  'submitted_at',
  'status',
  'verdict',
  'code',
  'reason',
  'trust',
  'ranked',
  'seed_kind',
  'world_hash',
  'world_mode',
  'world_seed',
  'leaderboard_key',
  'run_key',
  'delete_token_hash',
  'envelope',
  'lease_owner',
  'lease_until',
] as const;
export const DAILY_COLUMNS = ['k', 'v', 'created_at'] as const;

export interface BackupPayload {
  tenants: TenantExport[];
  runs: Row[];
  daily: Row[];
}
export interface BackupCounts {
  tenants: number;
  players: number;
  signals: number;
  acks: number;
  revokedTokens: number;
  keys: number;
  quarantine: number;
  pairings: number;
  runs: number;
  daily: number;
}
export interface BackupV3 {
  format: typeof BACKUP_FORMAT;
  schema: 3;
  bridge: { version: string };
  store: { kind: RealityStore['kind']; schema: number | null };
  startedAt: string;
  endedAt: string;
  counts: BackupCounts;
  payload: BackupPayload;
  digest: { alg: 'sha256'; value: string };
}

/** A backup that cannot be made or read as it should: said to the operator, nothing written. */
export class BackupError extends Error {}

// ─── The file's shape ─────────────────────────────────────────────────────────────────────────────────────────────

const ident = z.string().check(z.minLength(1), z.maxLength(256));
const text = (max: number) => z.string().check(z.maxLength(max));
const count = z.int().check(z.nonnegative());
const many = <T extends z.ZodMiniType>(t: T, max = MAX_BACKUP_ROWS) => z.array(t).check(z.maxLength(max));
/** A BIGINT: a number from SQLite, a decimal string from Postgres' driver. Read as a safe integer. */
const bigint = z.pipe(
  z.union([count, z.string().check(z.regex(/^\d{1,15}$/))]),
  z.transform((v) => Number(v)),
);
const nullable = <T extends z.ZodMiniType>(t: T) => z.optional(z.nullable(t));

const PlayerSchema = z.strictObject({
  playerId: ident,
  gameId: ident,
  capabilityHash: text(256),
  capabilityExpiresAt: count,
  issuedAt: z.optional(count),
  revoked: z.optional(z.boolean()),
  sessionId: z.optional(ident),
  origin: z.optional(text(2048)),
});
const SignalSchema = z.strictObject({
  tenantId: ident,
  playerId: ident,
  sequence: count,
  id: ident,
  dedupeKey: text(512),
  jws: text(1 << 20),
  at: count,
  kid: z.optional(ident),
  payload: z.optional(z.record(z.string(), z.unknown())),
});
const KeySchema = z.strictObject({
  tenantId: ident,
  keyId: ident,
  publicKey: text(4096),
  retireAfter: z.optional(text(64)),
});
const QuarantineSchema = z.strictObject({
  tenantId: ident,
  playerId: ident,
  sequence: count,
  reason: text(4096),
  at: count,
});
const PairingSchema = z.strictObject({
  code: ident,
  gameId: ident,
  expiresAt: count,
  playerId: z.optional(ident),
  claimed: z.optional(z.boolean()),
  origin: z.optional(text(2048)),
  /** A journal's pairing could carry the capability it hands out once (schema 1): read, then dropped. */
  capability: z.optional(text(4096)),
});
const TenantSchema = z.strictObject({
  tenantId: ident,
  players: many(PlayerSchema),
  signals: many(SignalSchema),
  acks: many(z.strictObject({ playerId: ident, through: count })),
  revokedTokens: many(ident),
  keys: many(KeySchema),
  quarantine: many(QuarantineSchema),
  pairings: z.optional(many(PairingSchema)),
});
const RunSchema = z.strictObject({
  tenant_id: ident,
  id: ident,
  game_id: ident,
  category_id: ident,
  player: text(256),
  submitted_at: bigint,
  status: text(1024),
  verdict: nullable(text(1 << 16)),
  code: nullable(text(1 << 16)),
  reason: nullable(text(1 << 20)),
  trust: text(1024),
  ranked: nullable(text(1024)),
  seed_kind: nullable(text(64)),
  world_hash: nullable(text(256)),
  world_mode: nullable(text(64)),
  world_seed: nullable(text(1024)),
  leaderboard_key: nullable(text(1024)),
  run_key: text(512),
  delete_token_hash: text(256),
  // Bounded by the file (`--max-bytes`), not here: the runs service's own limit is the operator's to raise.
  envelope: z.string(),
  lease_owner: nullable(text(256)),
  lease_until: nullable(bigint),
});
const DailySchema = z.strictObject({ k: text(1024).check(z.minLength(1)), v: text(1 << 20), created_at: bigint });

const LegacySchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schema: z.union([z.literal(1), z.literal(2)]),
  at: text(64),
  tenants: many(TenantSchema, 100_000),
  runs: z.optional(many(RunSchema)),
  daily: z.optional(many(DailySchema)),
});
const CountsSchema = z.strictObject({
  tenants: count,
  players: count,
  signals: count,
  acks: count,
  revokedTokens: count,
  keys: count,
  quarantine: count,
  pairings: count,
  runs: count,
  daily: count,
});
const V3Schema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schema: z.literal(3),
  bridge: z.strictObject({ version: text(64) }),
  store: z.strictObject({
    kind: z.enum(['memory', 'jsonl', 'sqlite', 'postgres']),
    schema: z.nullable(count),
  }),
  startedAt: text(64),
  endedAt: text(64),
  counts: CountsSchema,
  payload: z.strictObject({
    tenants: many(TenantSchema, 100_000),
    runs: many(RunSchema),
    daily: many(DailySchema),
  }),
  digest: z.strictObject({ alg: z.literal('sha256'), value: z.string().check(z.regex(/^[0-9a-f]{64}$/)) }),
});

/** A backup read and checked: its payload (rows normalised), the schema it was written in and when. */
export interface ReadBackup {
  schema: 1 | 2 | 3;
  at: string;
  storeSchema: number | null;
  payload: BackupPayload;
}

/** The first issues of a parse, path and message, for the operator. */
function issues(e: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Parses and checks a backup's text: its shape (every row of every family, unknown fields refused), then what the
 * rows say of each other (duplicates, a run of a tenant the file does not carry, an acknowledgement of a player it does
 * not hold), then, for schema 3, its counts and its digest. Throws `BackupError` saying the first problems found.
 */
export function readBackup(textIn: string): ReadBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(textIn);
  } catch (e) {
    throw new BackupError(`not JSON: ${(e as Error).message}`);
  }
  const schema = (raw as { schema?: unknown } | null)?.schema;
  if ((raw as { format?: unknown } | null)?.format !== BACKUP_FORMAT || ![1, 2, 3].includes(schema as number))
    throw new BackupError('not a Bridge backup of schema 1, 2 or 3');
  let out: ReadBackup;
  if (schema === 3) {
    const r = V3Schema.safeParse(raw);
    if (!r.success) throw new BackupError(`schema 3 refused: ${issues(r.error)}`);
    const payload = r.data.payload as BackupPayload;
    if (payloadDigest(payload) !== r.data.digest.value)
      throw new BackupError('the payload does not match its digest: the file was changed or truncated');
    if (stableJson(countsOf(payload)) !== stableJson(r.data.counts))
      throw new BackupError('the counts do not match the payload');
    out = { schema: 3, at: r.data.startedAt, storeSchema: r.data.store.schema, payload };
  } else {
    const r = LegacySchema.safeParse(raw);
    if (!r.success) throw new BackupError(`schema ${String(schema)} refused: ${issues(r.error)}`);
    out = {
      schema: r.data.schema,
      at: r.data.at,
      storeSchema: null,
      payload: { tenants: r.data.tenants as TenantExport[], runs: r.data.runs ?? [], daily: r.data.daily ?? [] },
    };
  }
  out.payload.tenants = out.payload.tenants.map(withoutCapabilities);
  const why = relations(out.payload, out.schema === 3);
  if (why) throw new BackupError(why);
  return out;
}

/** What the rows say of each other; undefined when they agree. */
function relations(p: BackupPayload, strictRuns: boolean): string | undefined {
  const dup = <T>(xs: T[], key: (x: T) => string): string | undefined => {
    const seen = new Set<string>();
    for (const x of xs) {
      const k = key(x);
      if (seen.has(k)) return k;
      seen.add(k);
    }
    return undefined;
  };
  const tenants = new Set<string>();
  for (const t of p.tenants) {
    try {
      checkTenant(t.tenantId);
    } catch {
      return `tenant "${t.tenantId.slice(0, 64)}" is not a tenant id`;
    }
    if (tenants.has(t.tenantId)) return `tenant ${t.tenantId} appears twice`;
    tenants.add(t.tenantId);
    const at = `tenant ${t.tenantId}`;
    const d =
      (dup(t.players, (x) => x.playerId) && `${at}: a player appears twice`) ||
      (dup(t.signals, (x) => `${x.playerId}\u0000${x.sequence}`) && `${at}: a signal's sequence appears twice`) ||
      (dup(t.signals, (x) => `${x.playerId}\u0000${x.dedupeKey}`) && `${at}: a signal's dedupe key appears twice`) ||
      (dup(t.acks, (x) => x.playerId) && `${at}: an acknowledgement appears twice`) ||
      (dup(t.revokedTokens, (x) => x) && `${at}: a revoked token appears twice`) ||
      (dup(t.keys, (x) => x.keyId) && `${at}: a key appears twice`) ||
      (dup(t.quarantine, (x) => `${x.playerId}\u0000${x.sequence}`) && `${at}: a quarantined row appears twice`) ||
      (dup(t.pairings ?? [], (x) => x.code) && `${at}: a pairing code appears twice`);
    if (d) return d;
    const players = new Set(t.players.map((x) => x.playerId));
    if (t.acks.some((a) => !players.has(a.playerId)))
      return `${at}: an acknowledgement names a player it does not hold`;
    for (const rows of [t.signals, t.keys, t.quarantine] as { tenantId: string }[][])
      if (rows.some((r) => r.tenantId !== t.tenantId)) return `${at}: a row belongs to another tenant`;
  }
  const run =
    (dup(p.runs, (r) => `${String(r.tenant_id)}\u0000${String(r.id)}`) && 'a run appears twice') ||
    (dup(p.runs, (r) => `${String(r.tenant_id)}\u0000${String(r.run_key)}`) && "a run's key appears twice") ||
    (dup(p.daily, (r) => String(r.k)) && 'a daily record appears twice');
  if (run) return run;
  if (strictRuns) {
    const stray = p.runs.find((r) => !tenants.has(String(r.tenant_id)));
    if (stray) return `a run belongs to tenant ${String(stray.tenant_id)}, which the backup does not carry`;
  }
  return undefined;
}
