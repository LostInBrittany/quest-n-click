// The backup's behaviour pinned before `bridge/src/backup.ts` is split into `bridge/src/backup/` (4.1.20 PR 1a, plan
// §6.0): the messages a refused file gets, the command line's exit codes and lines, and the canonical form of a backup
// (everything but its dates and the Bridge's version). The split changed where the code lives, nothing of this; PR 1b
// changed it on purpose (schema 4, ADR 0023: the envelope's digest, the completeness, the quota, the mode said), and
// pinned it again here.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { realityManifest } from '@engine/reality/manifest';
import {
  BackupError,
  type BackupPayload,
  makeBackup,
  payloadDigest,
  readBackup,
  restoreBackup,
  stableJson,
} from '../bridge/src/backup';
import { main } from '../bridge/src/cli';
import type { TenantExport } from '../bridge/src/store-async';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';
import { signals } from './fixtures/signals';

const temps: string[] = [];
const opened: SqliteRealityStore[] = [];
afterAll(async () => {
  for (const s of opened) await s.close().catch(() => {});
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'bridge-backup-char-'));
  temps.push(d);
  return d;
};

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
  signals: [
    {
      tenantId: id,
      playerId: 'p-0',
      sequence: 1,
      id: 's-1',
      dedupeKey: 'd-1',
      jws: 'jws.1',
      at: 5,
      kid: 'k1',
      payload: { v: 2 } as never,
    },
  ],
  acks: [{ playerId: 'p-0', through: 1 }],
  revokedTokens: ['tok-1'],
  keys: [{ tenantId: id, keyId: 'k1', publicKey: 'pub' }],
  quarantine: [{ tenantId: id, playerId: 'p-0', sequence: 9, reason: 'unreadable', at: 7 }],
  pairings: [{ code: 'ABCD-1234', gameId: 'g', expiresAt: 3_000, playerId: 'p-0', claimed: true }],
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
const payload = (): BackupPayload => ({
  tenants: [tenant('t-a'), tenant('t-b')],
  runs: [run('t-a', 'r1'), run('t-b', 'r2')],
  daily: [{ k: 'daily|g|2026-10-10', v: '{"token":"t"}', created_at: 7 }],
});

async function store(): Promise<{ s: SqliteRealityStore; url: string; dir: string }> {
  const dir = tmp();
  const file = join(dir, 'bridge.sqlite');
  const s = await SqliteRealityStore.open(file, { pollMs: 0 });
  opened.push(s);
  return { s, url: `sqlite:${file}`, dir };
}
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
const refusal = (text: string): string => {
  try {
    readBackup(text);
  } catch (e) {
    if (e instanceof BackupError) return e.message;
    throw e;
  }
  return '(read)';
};

describe('the backup before and after its split', () => {
  it('gives a refused file the same message', async () => {
    const { s } = await store();
    expect((await restoreBackup(s, payload(), { force: false, carriesRuns: true })).ok).toBe(true);
    const good = await makeBackup(s);
    const edit = (f: (b: Record<string, any>) => void) => {
      const b = JSON.parse(JSON.stringify(good));
      f(b);
      return JSON.stringify(b);
    };
    const v3 = (f: (b: Record<string, any>) => void) =>
      edit((b) => {
        f(b);
        const { format: _f, schema: _s, digest: _d, ...covered } = b;
        b.digest.value = createHash('sha256').update(stableJson(covered)).digest('hex');
      });
    expect({
      notJson: refusal('{').replace(/: .*/, ': …'),
      otherFormat: refusal(JSON.stringify({ format: 'x', schema: 3 })),
      schema5: refusal(edit((b) => void (b.schema = 5))),
      digest: refusal(edit((b) => void (b.payload.daily[0].v = 'changed'))),
      counts: refusal(edit((b) => void (b.counts.runs = 3))),
      unknownField: refusal(edit((b) => void (b.surprise = 1))),
      tenantTwice: refusal(v3((b) => (b.payload.tenants[1].tenantId = 't-a'))),
      strayRun: refusal(
        v3((b) => {
          b.payload.runs[1].tenant_id = 't-c';
        }),
      ),
      ackOfNoPlayer: refusal(v3((b) => (b.payload.tenants[0].acks[0].playerId = 'p-9'))),
      legacy: refusal(JSON.stringify({ format: 'web-scumm-bridge-backup', schema: 2, at: 'x', tenants: 'no' })),
    }).toEqual({
      notJson: 'not JSON: …',
      otherFormat: 'not a Bridge backup of schema 1, 2, 3 or 4',
      schema5: 'not a Bridge backup of schema 1, 2, 3 or 4',
      digest: 'the envelope does not match its digest: the file was changed or truncated',
      // Schema 4: the counts are under the digest, which a changed count breaks first.
      counts: 'the envelope does not match its digest: the file was changed or truncated',
      unknownField: 'schema 4 refused: (root): Invalid input',
      tenantTwice: 'tenant t-a appears twice',
      strayRun: 'a run belongs to tenant t-c, which the backup does not carry',
      ackOfNoPlayer: 'tenant t-a: an acknowledgement names a player it does not hold',
      legacy: 'schema 2 refused: tenants: Invalid input',
    });
  });

  it('writes the same canonical backup, its dates and the version aside', async () => {
    const { s } = await store();
    expect((await restoreBackup(s, payload(), { force: false, carriesRuns: true })).ok).toBe(true);
    const b = await makeBackup(s);
    expect(Object.keys(b)).toEqual([
      'format',
      'schema',
      'bridge',
      'store',
      'completeness',
      'startedAt',
      'endedAt',
      'counts',
      'payload',
      'digest',
    ]);
    // The version is the repository's here (the packed Bridge reads its own package's): a file moved deeper must
    // still find it, never write "unknown".
    expect(b.bridge.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
    // Schema 4's digest covers the dates, so it moves with every backup: the payload's own hash is pinned instead, and
    // the envelope's with its dates, version and digest aside.
    const { digest: _digest, ...envelope } = b;
    const fixed = { ...envelope, startedAt: '-', endedAt: '-', bridge: { version: '-' } };
    expect({ store: b.store, counts: b.counts, digest: payloadDigest(b.payload).slice(0, 16) }).toEqual({
      store: { kind: 'sqlite', schema: 4 },
      counts: {
        tenants: 2,
        players: 2,
        signals: 2,
        acks: 2,
        revokedTokens: 2,
        keys: 2,
        quarantine: 2,
        pairings: 2,
        runs: 2,
        daily: 1,
        quotas: 0,
      },
      digest: PINNED.digest,
    });
    expect(createHash('sha256').update(stableJson(fixed)).digest('hex').slice(0, 16)).toBe(PINNED.envelope);
  });

  it('answers the command line with the same codes and lines', async () => {
    const { s, url, dir } = await store();
    expect((await restoreBackup(s, payload(), { force: false, carriesRuns: true })).ok).toBe(true);
    expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
    const out = join(dir, 'b.json');
    const lines = async (args: string[]) => {
      const r = await cli([...args, `--dir=${dir}`, `--store=${url}`]);
      // The folder and its separator (`\\` on Windows) as one placeholder: the line, not the platform, is pinned.
      const masked = r.out
        .split(`${dir}${sep}`)
        .join('<dir>/')
        .split(dir)
        .join('<dir>')
        .replace(/sha256 [0-9a-f]{12}/, 'sha256 <hash>')
        .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<date>')
        // The file's size counts the version's characters: 4.2.0 is one shorter than 4.1.19.
        .replace(/would be \d+ bytes/, 'would be <n> bytes');
      return `${r.code} ${masked}`;
    };
    const forged = join(dir, 'forged.json');
    const seen = {
      usage: await lines(['backup']),
      backup: await lines(['backup', `--out=${out}`]),
      tooBig: await lines(['backup', `--out=${join(dir, 'x.json')}`, '--max-bytes=100']),
      held: await lines(['restore', `--from=${out}`, '--mode=merge']),
      forged: await (async () => {
        const f = JSON.parse(readFileSync(out, 'utf8'));
        f.payload.daily[0].v = 'changed';
        writeFileSync(forged, JSON.stringify(f));
        return lines(['restore', `--from=${forged}`, '--mode=merge', '--force']);
      })(),
      forced: await lines(['restore', `--from=${out}`, '--mode=merge', '--force']),
      restoreUsage: await lines(['restore']),
    };
    expect(seen).toEqual(PINNED.cli);
  });
});

/** What the code said on 12 October 2026, before the split (`8bd6575`). `store.schema` moves with a migration (PR 1b). */
const PINNED = {
  digest: 'e8676e68d52fcf7a',
  envelope: '61e40179766dd662',
  cli: {
    usage: '2 usage: backup --out=<file> [--max-bytes=<n>] [--max-rows=<n>]',
    backup:
      '0 ✔  2 tenant(s), 2 signal(s), 2 run(s), 1 daily record(s) backed up to <dir>/b.json (schema 4, one snapshot, sha256 <hash>…)',
    tooBig:
      "1 ✖  the backup would be <n> bytes, more than 100 (--max-bytes=): no file written; use pg_dump or the provider's snapshots",
    held: '1 ✖  the store already holds tenant(s) t-a, t-b, 2 run(s) of these tenants, 1 daily record(s): restore into an empty store, or --force; nothing restored',
    forged: '1 ✖  the envelope does not match its digest: the file was changed or truncated: nothing restored',
    forced:
      '0 ✔  2 tenant(s), 2 run(s), 1 daily record(s), 0 quota row(s) restored from <date> (schema 4, merge), checked before and after the commit',
    restoreUsage:
      "2 usage: restore --from=<backup file> --mode=merge [--force] [--max-bytes=<n>]   (a backup's digest is an integrity check, not a signature)\n       restore --from=<backup file> --mode=replace-store --yes-replace-store --safety-out=<new file> [--max-bytes=<n>] [--max-rows=<n>]",
  },
};
