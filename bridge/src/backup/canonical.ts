// The canonical text a backup's digest is taken of, and the normal form of its rows and tenants: one store gives the
// same file from SQLite and from Postgres. Split from `bridge/src/backup.ts` (4.1.20 PR 1a).
import { createHash } from 'node:crypto';
import type { TenantExport } from '../store-async';
import type { Row } from '../store-sql';
import type { BackupCounts, BackupPayload } from './schema';

/** JSON with keys sorted at every depth, `undefined` left out: the text a digest is taken of. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(',')}}`;
}
/** The SHA-256 of a payload's canonical text; the envelope's digest, which never covers itself. */
export const payloadDigest = (p: BackupPayload): string => createHash('sha256').update(stableJson(p)).digest('hex');

export function countsOf(p: BackupPayload): BackupCounts {
  const sum = (f: (t: TenantExport) => number) => p.tenants.reduce((n, t) => n + f(t), 0);
  return {
    tenants: p.tenants.length,
    players: sum((t) => t.players.length),
    signals: sum((t) => t.signals.length),
    acks: sum((t) => t.acks.length),
    revokedTokens: sum((t) => t.revokedTokens.length),
    keys: sum((t) => t.keys.length),
    quarantine: sum((t) => t.quarantine.length),
    pairings: sum((t) => t.pairings?.length ?? 0),
    runs: p.runs.length,
    daily: p.daily.length,
  };
}

/** A tenant without the capabilities a journal's pairings may hold in clear: a backup carries hashes only. */
export function withoutCapabilities(t: TenantExport): TenantExport {
  if (!t.pairings?.some((p) => p.capability !== undefined)) return t;
  return { ...t, pairings: t.pairings.map(({ capability: _, ...p }) => p) };
}

/** A run or daily row with every column of the canonical list, in its order, BIGINTs as numbers. */
export function normalRow(r: Row, cols: readonly string[]): Row {
  const out: Row = {};
  for (const c of cols) {
    const v = r[c];
    out[c] = v === undefined ? null : typeof v === 'bigint' || (typeof v === 'string' && isBig(c)) ? Number(v) : v;
  }
  return out;
}
const isBig = (c: string) => c === 'submitted_at' || c === 'lease_until' || c === 'created_at';

/** A tenant as an export reads it back: what a restore must find in the store before it commits. */
export function normalTenant(x: TenantExport): TenantExport {
  const by = <T>(xs: T[], key: (x: T) => string) =>
    [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const seq = (n: number) => String(n).padStart(16, '0');
  return {
    tenantId: x.tenantId,
    players: by(x.players, (p) => p.playerId).map((p) => ({ ...p, ...(p.revoked ? {} : { revoked: undefined }) })),
    signals: by(x.signals, (s) => `${s.playerId}\u0000${seq(s.sequence)}`).map((s) => ({ ...s, tenantId: x.tenantId })),
    acks: by(
      x.acks.filter((a) => a.through > 0),
      (a) => a.playerId,
    ),
    revokedTokens: [...x.revokedTokens].sort(),
    keys: by(x.keys, (k) => k.keyId).map((k) => ({ ...k, tenantId: x.tenantId })),
    quarantine: by(x.quarantine, (r) => `${r.playerId}\u0000${seq(r.sequence)}`).map((r) => ({
      ...r,
      tenantId: x.tenantId,
    })),
    pairings: by(x.pairings ?? [], (p) => p.code).map((p) => ({ ...p, ...(p.claimed ? {} : { claimed: undefined }) })),
  };
}

export const byCodeUnit = (key: (r: Row) => string) => (a: Row, b: Row) => {
  const x = key(a);
  const y = key(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
export const runKey = (r: Row) => `${String(r.tenant_id)}\u0000${String(r.id)}`;
