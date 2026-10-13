// The backup's contract, schema 4 (4.1.20 PR 1b, ADR 0023, plan §6.1–6.3): the digest covers the whole envelope (its
// metadata as well as its rows), the backup says what it holds (`completeness`), the speedrun quota is a family of it,
// every SQL table is classified, and a restore names its mode: `merge` (4.1.19's restore) or `replace-store`, which
// makes the store the snapshot — a complete backup of the same SQL schema only, after a safety backup checked first.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { realityManifest } from '@engine/reality/manifest';
import { type BackupPayload, makeBackup, readBackup, restoreBackup, stableJson, TABLES } from '../bridge/src/backup';
import { main } from '../bridge/src/cli';
import type { TenantExport } from '../bridge/src/store-async';
import { type PgModule, PostgresRealityStore } from '../bridge/src/store-postgres';
import type { SqlRealityStore } from '../bridge/src/store-sql';
import { MemoryRealityStore } from '../bridge/src/store-memory';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';
import { pgDatabase } from './fixtures/pg-database';
import { signals } from './fixtures/signals';

const temps: string[] = [];
const opened: SqlRealityStore[] = [];
afterAll(async () => {
  for (const s of opened) await s.close().catch(() => {});
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'bridge-backup-v4-'));
  temps.push(d);
  return d;
};

const KINDS: { name: string; open(): Promise<{ s: SqlRealityStore; url: string }> }[] = [
  {
    name: 'sqlite',
    open: async () => {
      const file = join(tmp(), 'bridge.sqlite');
      const s = await SqliteRealityStore.open(file, { pollMs: 0 });
      opened.push(s);
      return { s, url: `sqlite:${file}` };
    },
  },
];
if (process.env.BRIDGE_PG_URL)
  KINDS.push({
    name: 'postgres',
    open: async () => {
      const pg = ((await import(/* @vite-ignore */ process.env.BRIDGE_PG_MODULE ?? 'pg')) as { default: PgModule })
        .default;
      const url = await pgDatabase('bridge_backup_four');
      const s = await PostgresRealityStore.open(url, { pg });
      opened.push(s);
      return { s, url };
    },
  });

const tenant = (id: string): TenantExport => ({
  tenantId: id,
  players: [
    {
      playerId: 'p-0',
      gameId: 'g',
      capabilityHash: 'h'.repeat(64),
      capabilityExpiresAt: 2_000_000_000_000,
      issuedAt: 1,
    },
  ],
  signals: [],
  acks: [],
  revokedTokens: [],
  keys: [],
  quarantine: [],
  pairings: [],
});
const run = (tenantId: string, id: string) => ({
  tenant_id: tenantId,
  id,
  game_id: 'g',
  category_id: 'any%',
  player: `player-${id}`,
  submitted_at: 1_000,
  status: 'verified',
  verdict: 'valid',
  code: null,
  reason: null,
  trust: 'replay-valid',
  ranked: '42',
  seed_kind: null,
  world_hash: null,
  world_mode: null,
  world_seed: null,
  leaderboard_key: 'any%',
  run_key: `key-${id}`,
  delete_token_hash: 'h'.repeat(64),
  envelope: '{"v":2}',
  lease_owner: null,
  lease_until: null,
});
const quota = (tenantId: string, client: string) => ({
  tenant_id: tenantId,
  client_key: client,
  key_version: 'k1',
  tokens: 2.5,
  at: 9_000,
});
const payload = (ids = ['t-a', 't-b']): BackupPayload => ({
  tenants: ids.map(tenant),
  runs: ids.map((t) => run(t, `r-${t}`)),
  daily: [{ k: `daily|g|${ids.join('-')}`, v: '{"token":"t"}', created_at: 7 }],
  quotas: ids.map((t) => quota(t, `c-${t}`)),
});
const fill = async (s: SqlRealityStore, p: BackupPayload) => {
  const r = await restoreBackup(s, p, { force: false, carriesRuns: true, carriesQuotas: true });
  expect(r.ok, r.ok ? '' : r.why).toBe(true);
};
const state = async (s: SqlRealityStore) => stableJson((await makeBackup(s)).payload);
/** A backup's envelope digest as schema 4 computes it: everything but `format`, `schema` and `digest` itself. */
const redigest = (b: Record<string, unknown>) => {
  const { format: _f, schema: _s, digest: _d, ...covered } = b;
  (b.digest as { value: string }).value = createHash('sha256').update(stableJson(covered)).digest('hex');
  return b;
};

async function cli(args: string[]): Promise<{ code: number; out: string }> {
  const out: string[] = [];
  const [log, err] = [console.log, console.error];
  console.log = (x: unknown) => void out.push(String(x));
  console.error = (x: unknown) => void out.push(String(x));
  try {
    return { code: await main(args, { manifest: realityManifest(signals()) }), out: out.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

describe.each(KINDS)('backup schema 4 on $name', (kind) => {
  it('is written with its completeness and the quota family, and its digest covers the whole envelope', async () => {
    const { s } = await kind.open();
    await fill(s, payload());
    const b = await makeBackup(s);
    expect(b.schema).toBe(4);
    expect(b.completeness).toEqual({
      scope: 'whole-store',
      families: ['tenants', 'runs', 'daily', 'run-quotas'],
      controlFamilies: ['schema-migrations', 'maintenance'],
    });
    expect(b.digest.scope).toBe('envelope');
    expect(b.payload.quotas).toHaveLength(2);
    expect(b.counts.quotas).toBe(2);
    expect(readBackup(JSON.stringify(b)).schema).toBe(4);
    // Every metadata the file is judged by: changed without the digest, refused.
    for (const edit of [
      (x: any) => (x.store.schema = 99),
      (x: any) => (x.store.kind = 'sqlite' === x.store.kind ? 'postgres' : 'sqlite'),
      (x: any) => (x.bridge.version = '9.9.9'),
      (x: any) => (x.startedAt = '2001-01-01T00:00:00.000Z'),
      (x: any) => (x.endedAt = '2999-01-01T00:00:00.000Z'),
      (x: any) => (x.completeness.scope = 'tenants-only'),
      (x: any) => x.payload.quotas.pop(),
    ]) {
      const x = JSON.parse(JSON.stringify(b));
      edit(x);
      expect(() => readBackup(JSON.stringify(x)), String(edit)).toThrow(/digest/);
    }
  });

  it('refuses metadata that do not hold, even with a digest recomputed', async () => {
    const { s } = await kind.open();
    const b = JSON.parse(JSON.stringify(await makeBackup(s)));
    const bad = (edit: (x: any) => void) => {
      const x = JSON.parse(JSON.stringify(b));
      edit(x);
      return () => readBackup(JSON.stringify(redigest(x)));
    };
    expect(bad((x) => (x.startedAt = 'yesterday'))).toThrow(/startedAt/);
    expect(bad((x) => (x.endedAt = '2000-01-01T00:00:00.000Z'))).toThrow(/endedAt/);
    expect(bad((x) => (x.bridge.version = 'latest'))).toThrow(/version/);
    expect(bad((x) => (x.completeness.families = ['tenants']))).toThrow(/completeness/);
    expect(bad((x) => (x.counts.quotas = 7))).toThrow(/counts/);
  });

  it('a quota travels: backed up, restored, compared', async () => {
    const { s } = await kind.open();
    await fill(s, payload());
    const b = await makeBackup(s);
    const { s: t } = await kind.open();
    const r = await restoreBackup(t, readBackup(JSON.stringify(b)).payload, {
      force: false,
      carriesRuns: true,
      carriesQuotas: true,
    });
    expect(r.ok).toBe(true);
    expect((await makeBackup(t)).payload.quotas).toEqual(b.payload.quotas);
  });

  it('merge keeps what the file does not speak of; replace-store makes the store the snapshot', async () => {
    const { s } = await kind.open();
    await fill(s, payload(['t-foreign']));
    const file = readBackup(
      JSON.stringify(
        await (async () => {
          const { s: src } = await kind.open();
          await fill(src, payload());
          return makeBackup(src);
        })(),
      ),
    );
    const merged = await restoreBackup(s, file.payload, { force: true, carriesRuns: true, carriesQuotas: true });
    expect(merged.ok).toBe(true);
    expect((await makeBackup(s)).payload.tenants.map((x) => x.tenantId)).toEqual(['t-a', 't-b', 't-foreign']);
    const replaced = await restoreBackup(s, file.payload, {
      force: true,
      carriesRuns: true,
      carriesQuotas: true,
      mode: 'replace-store',
    });
    expect(replaced.ok).toBe(true);
    expect(await state(s)).toBe(stableJson(file.payload));
  });

  it('replace-store that fails at its last statement leaves the store as it was', async () => {
    const { s } = await kind.open();
    await fill(s, payload(['t-keep']));
    const before = await state(s);
    const p = payload();
    // Past the file's checks on purpose: the database refuses the last row (a daily key twice), after every delete.
    p.daily.push({ ...p.daily[0]! });
    await expect(
      restoreBackup(s, p, { force: true, carriesRuns: true, carriesQuotas: true, mode: 'replace-store' }),
    ).rejects.toThrow();
    expect(await state(s)).toBe(before);
  });
});

describe('every SQL table is classified', () => {
  it.each(KINDS)('on $name: a table the migrations create and the registry does not name fails here', async (kind) => {
    const { s } = await kind.open();
    const rows =
      kind.name === 'sqlite'
        ? await s.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        : await s.db.all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'");
    const tables = rows.map((r) => String(r.name)).sort();
    expect(tables.length).toBeGreaterThan(5);
    expect(tables.filter((t) => !(t in TABLES))).toEqual([]);
    for (const t of tables) expect(['backed-up', 'control', 'explicit-ephemeral']).toContain(TABLES[t]!.kind);
  });
});

describe('restore from the command line names its mode', () => {
  it('without --mode, or with --force alone, nothing is restored and both modes are named', async () => {
    const { s, url } = await KINDS[0]!.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    await fill(s, payload());
    const out = join(dir, 'b.json');
    expect((await cli(['backup', `--dir=${dir}`, `--store=${url}`, `--out=${out}`])).code).toBe(0);
    for (const extra of [[], ['--force']]) {
      const r = await cli(['restore', `--dir=${dir}`, `--store=${url}`, `--from=${out}`, ...extra]);
      expect(r.code, extra.join(' ')).toBe(2);
      expect(r.out).toMatch(/--mode=merge.*--mode=replace-store|--mode=replace-store.*--mode=merge/s);
    }
  });

  it('replace-store asks its confirmation, a safety backup that does not exist yet, a complete file of this schema', async () => {
    const { s, url } = await KINDS[0]!.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    await fill(s, payload());
    const before = await state(s);
    const out = join(dir, 'b.json');
    expect((await cli(['backup', `--dir=${dir}`, `--store=${url}`, `--out=${out}`])).code).toBe(0);
    const base = ['restore', `--dir=${dir}`, `--store=${url}`, `--from=${out}`, '--mode=replace-store'];
    const safety = join(dir, 'safety.json');
    expect((await cli([...base, `--safety-out=${safety}`])).out).toMatch(/--yes-replace-store/);
    expect((await cli([...base, '--yes-replace-store'])).out).toMatch(/--safety-out/);
    writeFileSync(join(dir, 'there.json'), 'x');
    expect((await cli([...base, '--yes-replace-store', `--safety-out=${join(dir, 'there.json')}`])).out).toMatch(
      /already exists/,
    );
    symlinkSync(join(dir, 'nowhere.json'), join(dir, 'link.json'));
    expect((await cli([...base, '--yes-replace-store', `--safety-out=${join(dir, 'link.json')}`])).out).toMatch(
      /already exists|link/,
    );
    // A safety backup that cannot be written: nothing deleted.
    const r = await cli([...base, '--yes-replace-store', `--safety-out=${join(dir, 'no', 'such', 'dir.json')}`]);
    expect(r.code).not.toBe(0);
    expect(await state(s)).toBe(before);
    // A schema 3 file (no completeness under its digest) is refused for replace-store, accepted for merge.
    const v3 = JSON.parse(readFileSync(out, 'utf8'));
    const three = join(dir, 'three.json');
    writeFileSync(three, JSON.stringify(toSchema3(v3)));
    const refused = await cli([
      'restore',
      `--dir=${dir}`,
      `--store=${url}`,
      `--from=${three}`,
      '--mode=replace-store',
      '--yes-replace-store',
      `--safety-out=${join(dir, 's3.json')}`,
    ]);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/schema 4/);
    // Done: the safety file is written first, and said in the output.
    const ok = await cli([...base, '--yes-replace-store', `--safety-out=${safety}`]);
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain(safety);
    expect(existsSync(safety)).toBe(true);
    expect(readBackup(readFileSync(safety, 'utf8')).schema).toBe(4);
    expect(await state(s)).toBe(before);
  });
});

describe('a file that speaks for its tenants only', () => {
  it('merged with --force into a SQL store, leaves that store’s runs and quotas of its tenants as they are', async () => {
    const { s, url } = await KINDS[0]!.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    await fill(s, payload(['t-a']));
    const before = (await makeBackup(s)).payload;
    // A journal's (or memory's) backup: schema 4, `tenants-only`, the same tenant.
    const memory = new MemoryRealityStore();
    await memory.importTenant(tenant('t-a'));
    const file = join(dir, 'tenants-only.json');
    writeFileSync(file, JSON.stringify(await makeBackup(memory)));
    expect(readBackup(readFileSync(file, 'utf8')).completeness?.scope).toBe('tenants-only');
    const r = await cli(['restore', `--dir=${dir}`, `--store=${url}`, `--from=${file}`, '--mode=merge', '--force']);
    expect(r.code, r.out).toBe(0);
    const after = (await makeBackup(s)).payload;
    expect(after.runs).toEqual(before.runs);
    expect(after.quotas).toEqual(before.quotas);
  });

  it('merge refuses the options of replace-store: they would say a safety backup that is never taken', async () => {
    const { url } = await KINDS[0]!.open();
    const dir = tmp();
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    const out = join(dir, 'b.json');
    expect((await cli(['backup', `--dir=${dir}`, `--store=${url}`, `--out=${out}`])).code).toBe(0);
    for (const extra of [`--safety-out=${join(dir, 's.json')}`, '--yes-replace-store']) {
      const r = await cli(['restore', `--dir=${dir}`, `--store=${url}`, `--from=${out}`, '--mode=merge', extra]);
      expect(r.code, extra).toBe(2);
      expect(r.out).toMatch(/replace-store's/);
    }
  });
});

/** A schema 4 file written back as the schema 3 a 4.1.19 Bridge wrote (no completeness, no quotas, payload digest). */
function toSchema3(b: any) {
  const payload = { tenants: b.payload.tenants, runs: b.payload.runs, daily: b.payload.daily };
  const { quotas: _q, ...counts } = b.counts;
  return {
    format: b.format,
    schema: 3,
    bridge: b.bridge,
    store: b.store,
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    counts,
    payload,
    digest: { alg: 'sha256', value: createHash('sha256').update(stableJson(payload)).digest('hex') },
  };
}
