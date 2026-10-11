#!/usr/bin/env node
// npm run ops:qualify -- [--tarballs=<dir>] [--image-from=<dir>] [--out=<dir>] [--keep] (4.1.18 "Dress Rehearsal", plan §8.3): the Bridge's
// qualification profile (ops/qualify/compose.yml) built from the candidate's `web-scumm-bridge` tarball, brought up
// behind HTTPS with three instances on one Postgres and two tenants, then driven the way an operator's bad day goes:
//
//   1. every image pinned by digest (compose and Dockerfile);
//   2. two tenants initialised by the package's own `init` and `grant`, three players each paired over HTTPS;
//   3. a stream held on one instance while proposals go through the proxy to all three;
//   4. an instance killed in the middle, then started again; a connector repeats what failed (its dedupeKey);
//   5. every player's sequence contiguous, each proposal applied once, duplicates said so, the stream in order;
//   6. a tenant's capability and token refused by the other tenant;
//   7. (4.1.19) the leaderboard of tenant a: the daily token alike on the three instances, a Mystery committed on one
//      and revealed on the others, a run verified by the speedrun worker and read elsewhere, its duplicate refused, a
//      moderator's bearer, an instance killed while its worker verifies (another takes the run when the lease ends,
//      verifies it once), one submission quota for the three instances, the board after 20 000 runs;
//   8. `backup` (schema 3: tenants, runs and daily records in one snapshot), the whole topology destroyed (its database
//      volume too), brought up empty, `restore`, then every player's signals, the board and the daily token compared,
//      and a new proposal continuing the sequence;
//   9. a store made by the published 4.1.17 Bridge read by this one.
//
// Writes <out>/ops-qualify.json (format web-scumm-ops-qualify, schema 1: the commit, the images, each step and what
// it measured) and exits 1 when a step fails. Docker with Compose v2 on Linux; the human pass behind a real domain for
// 24-48 h (`bridge-postgres-https`) uses the same profile (ops/qualify/README.md).
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildContext, IDENTITY } from './bridge-image.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PROFILE = join(ROOT, 'ops', 'qualify');
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const out = resolve(flag('out') ?? '.cache/field/deployment');
mkdirSync(out, { recursive: true });
const base = mkdtempSync(join(tmpdir(), 'web-scumm-qualify-'));
// Whatever ends the run (a setup step that throws included), its folder (tenant keys, the store's URL) goes with it.
process.on('exit', () => {
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
});
const PORT = Number(flag('port') ?? 8443);
const steps = [];
const step = (name, ok, detail = {}) => {
  steps.push({ name, ok, ...detail });
  console.log(`${ok ? '✔' : '✖'}  ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
  return ok;
};
const sh = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, {
    encoding: 'utf8',
    stdio: o.input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    ...o,
  });
  if (r.status !== 0 && !o.allowFail) throw new Error(`${cmd} ${a.join(' ')}: exit ${r.status}\n${r.stderr}`);
  return r;
};

// ---------------------------------------------------------------- 1. the images and the package
const compose = readFileSync(join(PROFILE, 'compose.yml'), 'utf8');
const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1]).filter((i) => !i.endsWith(':qualify'));
const from = [...readFileSync(join(PROFILE, 'Dockerfile.bridge'), 'utf8').matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
step(
  'every image pinned by digest',
  [...images, ...from].every((i) => /@sha256:[0-9a-f]{64}$/.test(i)),
  {
    images: [...images, ...from],
  },
);
let tarballs = flag('tarballs');
if (!tarballs) {
  tarballs = join(base, 'pack');
  sh(process.execPath, [join(ROOT, 'scripts', 'pack.mjs'), `--out=${tarballs}`], { stdio: 'inherit' });
}
const bridgeTgz = join(resolve(tarballs), `web-scumm-bridge-${version}.tgz`);
if (!existsSync(bridgeTgz)) throw new Error(`${bridgeTgz}: no Bridge archive of ${version}`);
// The image (4.1.19, plan §6.2): the candidate's, loaded and checked by its digests (`--image-from=`, built once by
// scripts/bridge-image.mjs in the candidate); else built here from the archive and the image's versioned lock.
const imageFrom = flag('image-from');
const build = buildContext(bridgeTgz, join(base, 'build'));
let image = { built: 'here' };
if (imageFrom) {
  sh(process.execPath, [join(ROOT, 'scripts', 'bridge-image.mjs'), 'load', `--from=${resolve(imageFrom)}`], {
    stdio: 'inherit',
  });
  image = JSON.parse(readFileSync(join(resolve(imageFrom), IDENTITY), 'utf8'));
}
step(
  'the Bridge image',
  true,
  imageFrom
    ? { configDigest: image.configDigest, manifestDigest: image.manifestDigest, archiveSha256: image.archiveSha256 }
    : { built: 'from the archive and the versioned lock' },
);

// ---------------------------------------------------------------- 2. the tenants, by the package's own commands
const host = join(base, 'host-bridge');
mkdirSync(host);
sh('tar', ['-xzf', bridgeTgz, '-C', host, '--strip-components=1']);
// The archive's own lock (npm-shrinkwrap.json, 4.1.19): `ci`, nothing resolved.
sh('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: host });
const BIN = join(host, 'bin.mjs');
const manifest = {
  format: 'web-scumm-reality-manifest',
  schema: 1,
  gameId: 'qualify',
  signals: [{ id: 'letter.unclear', source: 'email', availability: 'optional', replay: 'record', once: false }],
  connectors: { email: { answers: [], otherwise: 'letter.unclear' } },
};
writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest));
const data = join(base, 'data');
const tokens = {};
for (const t of ['a', 'b']) {
  sh(process.execPath, [
    BIN,
    'init',
    `--dir=${join(data, t)}`,
    `--tenant=${t}`,
    '--environment=dev',
    `--manifest=${join(base, 'manifest.json')}`,
    '--no-demo-webhooks',
  ]);
  tokens[t] = sh(process.execPath, [
    BIN,
    'grant',
    `--dir=${join(data, t)}`,
    '--connector=qualify',
    '--source=email',
    '--signals=letter.unclear',
    '--pair',
  ]).stdout.trim();
}
// Tenant a also keeps a leaderboard (4.1.19, plan §9): the reference game approved by its fingerprint, the speedrun
// worker from /srv/app (QUALIFY_APP), a shared quota of RUNS_PER_MINUTE submissions, a moderator's token file, and the
// daily challenge with the reference's published test key.
const RUNS_PER_MINUTE = 6;
const fingerprintScript = join(base, 'fingerprint.ts');
writeFileSync(
  fingerprintScript,
  `const { approvedContext } = await import(${JSON.stringify(join(ROOT, 'tools', 'speedrun', 'package.ts'))});\nconsole.log(JSON.stringify((await approvedContext(process.env.GAME_DIR)).fingerprint));\n`,
);
const fingerprint = JSON.parse(
  sh(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), fingerprintScript], {
    cwd: ROOT,
    env: { ...process.env, GAME_DIR: join(ROOT, 'games', 'reference') },
  })
    .stdout.trim()
    .split('\n')
    .at(-1),
);
const moderator = randomBytes(24).toString('hex');
{
  const dir = join(data, 'a');
  const file = join(dir, 'config.json');
  const daily = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'reference-daily-key.json'), 'utf8'));
  writeFileSync(join(dir, 'daily.jwk'), JSON.stringify(daily.jwk), { mode: 0o600 });
  writeFileSync(join(dir, 'daily.secret'), `${randomBytes(24).toString('hex')}\n`, { mode: 0o600 });
  writeFileSync(join(dir, 'moderation.token'), `${moderator}\n`, { mode: 0o600 });
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.runs = {
    games: { reference: { dir: '/srv/app/games/reference', fingerprint } },
    worker: ['node', '/srv/app/node_modules/tsx/dist/cli.mjs', '/srv/app/tools/speedrun/worker.ts'],
    workers: 1,
    perMinute: RUNS_PER_MINUTE,
    adminTokenFile: 'moderation.token',
  };
  config.daily = {
    games: { reference: { daily: 'daily', mystery: 'mystery' } },
    kid: daily.kid,
    keyFile: 'daily.jwk',
    secretFile: 'daily.secret',
  };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
const envelope = readFileSync(join(ROOT, 'tests', 'fixtures', 'speedrun', 'reference-any.wsrun'), 'utf8');

const secrets = join(base, 'secrets');
mkdirSync(secrets, { mode: 0o700 });
const pw = randomBytes(18).toString('hex');
// Postgres reads its file as its own user: 0644 inside a folder only the operator can open; the URL stays 0600.
writeFileSync(join(secrets, 'pg_password'), pw);
chmodSync(join(secrets, 'pg_password'), 0o644);
writeFileSync(join(secrets, 'store_url'), `postgres://bridge:${pw}@postgres:5432/bridge`, { mode: 0o600 });

const env = {
  ...process.env,
  QUALIFY_BUILD: build,
  QUALIFY_DATA: data,
  QUALIFY_APP: ROOT,
  QUALIFY_SECRETS: secrets,
  QUALIFY_UID: String(process.getuid?.() ?? 1000),
  QUALIFY_GID: String(process.getgid?.() ?? 1000),
  QUALIFY_PORT: String(PORT),
  QUALIFY_PORT_1: String(PORT + 1),
  QUALIFY_PORT_2: String(PORT + 2),
  QUALIFY_PORT_3: String(PORT + 3),
};
const dc = (a, o = {}) => sh('docker', ['compose', '-f', join(PROFILE, 'compose.yml'), ...a], { env, ...o });
/** The images pulled first, again on a registry's rate limit (a shared runner's address meets it): five tries. */
function pull() {
  for (let i = 1; ; i++) {
    const r = dc(['pull', '--ignore-buildable', '--quiet'], { allowFail: true });
    if (r.status === 0) return;
    if (i >= 5) throw new Error(`the images could not be pulled: ${r.stderr.slice(0, 300)}`);
    sh('sleep', [String(15 * i)]);
  }
}
const up = () => (
  pull(),
  dc(['up', '-d', imageFrom ? '--no-build' : '--build', '--wait', '--wait-timeout', '180'], { stdio: 'inherit' })
);

let ca = '';
const https = (port, method, path, { tenant, bearer, body, deleteToken } = {}) =>
  new Promise((ok, ko) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        host: '127.0.0.1',
        servername: 'localhost',
        port,
        method,
        path,
        ca,
        headers: {
          ...(tenant ? { 'x-web-scumm-tenant': tenant } : {}),
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(deleteToken ? { 'x-delete-token': deleteToken } : {}),
          ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
          host: `localhost:${port}`,
        },
        timeout: 10_000,
      },
      (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(s);
          } catch {
            /* not JSON */
          }
          ok({ status: res.statusCode, json });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', ko);
    if (data) req.write(data);
    req.end();
  });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** What a connector does: the same proposal again until the Bridge answers it (502/503/network), at most 30 times. */
async function insist(port, method, path, o) {
  for (let i = 0; ; i++) {
    try {
      const r = await https(port, method, path, o);
      if (r.status < 500 || i >= 30) return r;
    } catch (e) {
      if (i >= 30) throw e;
    }
    await sleep(300);
  }
}
async function readyCa() {
  for (let i = 0; i < 60; i++) {
    const r = dc(['exec', '-T', 'proxy', 'cat', '/data/caddy/pki/authorities/local/root.crt'], { allowFail: true });
    if (r.status === 0 && r.stdout.includes('BEGIN CERTIFICATE')) {
      ca = r.stdout;
      try {
        if ((await https(PORT, 'GET', '/readyz')).status === 200) return;
      } catch {
        /* the proxy's certificate not issued yet */
      }
    }
    await sleep(1000);
  }
  throw new Error('the proxy never answered /readyz over HTTPS');
}
/** Every signal of a player, by their capability: the signed signals and their sequences, in order. */
const signalsOf = async (tenant, cap) =>
  (await insist(PORT, 'GET', '/v1/signals', { tenant, bearer: cap })).json ?? null;

const report = {
  format: 'web-scumm-ops-qualify',
  schema: 1,
  version,
  commit: '',
  images: [...images, ...from],
  image,
  steps,
};
report.commit = sh('git', ['rev-parse', 'HEAD'], { cwd: ROOT, allowFail: true }).stdout.trim();
let failedHard = null;
try {
  up();
  await readyCa();
  step('three Bridges and Postgres up behind HTTPS', true);

  // Players, paired over HTTPS the way a game and a connector pair them.
  const players = { a: [], b: [] };
  for (const t of ['a', 'b'])
    for (let i = 0; i < 3; i++) {
      const code = (await insist(PORT, 'POST', '/v1/pairings', { tenant: t, body: { gameId: 'qualify' } })).json?.code;
      const conf = await insist(PORT, 'POST', `/v1/pairings/${code}/confirm`, { tenant: t, bearer: tokens[t] });
      const claim = await insist(PORT, 'GET', `/v1/pairings/${code}`, { tenant: t });
      players[t].push({ id: conf.json?.playerId, cap: claim.json?.capability });
    }
  step(
    'six players paired over HTTPS, three per tenant',
    Object.values(players)
      .flat()
      .every((p) => p.id && p.cap),
  );

  // A stream held on bridge-1 for the first player of tenant a.
  const streamed = [];
  const stream = request({
    host: '127.0.0.1',
    servername: 'localhost',
    port: PORT + 1,
    path: '/v1/events',
    ca,
    headers: { 'x-web-scumm-tenant': 'a', authorization: `Bearer ${players.a[0].cap}`, host: `localhost:${PORT + 1}` },
  });
  stream.on('response', (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c;
      for (let i; (i = buf.indexOf('\n\n')) >= 0; ) {
        const id = /^id: (\d+)$/m.exec(buf.slice(0, i))?.[1];
        if (id) streamed.push(Number(id));
        buf = buf.slice(i + 2);
      }
    });
  });
  stream.on('error', () => {});
  stream.end();
  await sleep(1000);

  // Proposals through the proxy; bridge-2 killed a third of the way, started again two thirds of the way.
  const N = 20;
  const answers = { accepted: 0, duplicate: 0, other: [] };
  let sent = 0;
  const total = N * 6;
  for (let i = 0; i < N; i++)
    for (const t of ['a', 'b'])
      for (const p of players[t]) {
        if (sent === Math.floor(total / 3)) dc(['kill', 'bridge-2']);
        if (sent === Math.floor((2 * total) / 3)) dc(['start', 'bridge-2']);
        sent++;
        const body = { playerId: p.id, signal: 'letter.unclear', source: 'email', dedupeKey: `${t}-${p.id}-${i}` };
        const r = await insist(PORT, 'POST', '/v1/signals', { tenant: t, bearer: tokens[t], body });
        if (r.status === 202) answers.accepted++;
        else if (r.status === 200 && r.json?.duplicate) answers.duplicate++;
        else answers.other.push(`${r.status} ${JSON.stringify(r.json)}`);
        // Every fifth, the connector sends it again: applied once, said a duplicate.
        if (i % 5 === 0) {
          const again = await insist(PORT, 'POST', '/v1/signals', { tenant: t, bearer: tokens[t], body });
          if (again.status === 200 && again.json?.duplicate) answers.duplicate++;
          else answers.other.push(`again: ${again.status} ${JSON.stringify(again.json)}`);
        }
      }
  dc(['up', '-d', '--wait', 'bridge-2']);
  step('bridge-2 serves again after its restart', (await insist(PORT + 2, 'GET', '/readyz')).status === 200);

  // In flight: proposals sent straight to bridge-2 (its own port, no proxy retry) in bursts while it is killed; then
  // the connector sends each again through the proxy. A lost answer comes back a duplicate or accepted, never twice.
  const victim = players.b[2];
  const bodyOf = (k) => ({
    playerId: victim.id,
    signal: 'letter.unclear',
    source: 'email',
    dedupeKey: `inflight-${k}`,
  });
  let K = 0;
  let lost = 0;
  let stop = false;
  const flight = (async () => {
    while (!stop && K < 400) {
      const batch = Array.from({ length: 8 }, () => K++);
      const got = await Promise.all(
        batch.map((k) =>
          https(PORT + 2, 'POST', '/v1/signals', { tenant: 'b', bearer: tokens.b, body: bodyOf(k) }).then(
            (r) => r.status,
            () => 'lost',
          ),
        ),
      );
      lost += got.filter((x) => x === 'lost' || (typeof x === 'number' && x >= 500)).length;
      if (lost >= 8) stop = true;
    }
  })();
  await sleep(400);
  dc(['kill', 'bridge-2']);
  await sleep(1500);
  stop = true;
  await flight;
  const resent = { accepted: 0, duplicate: 0, other: [] };
  for (let k = 0; k < K; k++) {
    const r = await insist(PORT, 'POST', '/v1/signals', { tenant: 'b', bearer: tokens.b, body: bodyOf(k) });
    if (r.status === 202) resent.accepted++;
    else if (r.status === 200 && r.json?.duplicate) resent.duplicate++;
    else resent.other.push(`${r.status} ${JSON.stringify(r.json)}`);
  }
  dc(['start', 'bridge-2']);
  dc(['up', '-d', '--wait', 'bridge-2']);
  step(
    'proposals in flight on a killed instance, sent again: each applied once',
    lost > 0 && resent.other.length === 0,
    {
      sent: K,
      lostInFlight: lost,
      resentAccepted: resent.accepted,
      resentDuplicate: resent.duplicate,
      refused: resent.other.slice(0, 3),
    },
  );

  const expected = Array.from({ length: N }, (_, k) => k + 1);
  const expectedOf = (key) => (key === `b/${victim.id}` ? Array.from({ length: N + K }, (_, k) => k + 1) : expected);
  const before = {};
  const full = {};
  for (const t of ['a', 'b'])
    for (const p of players[t]) {
      full[`${t}/${p.id}`] = await signalsOf(t, p.cap);
      before[`${t}/${p.id}`] = full[`${t}/${p.id}`]?.sequences ?? null;
    }
  // A proposal whose answer was lost when its instance died, sent again, is a duplicate; none is applied twice.
  step(
    'every proposal applied once across a killed instance',
    answers.other.length === 0 && answers.accepted <= total,
    {
      accepted: answers.accepted,
      duplicates: answers.duplicate,
      refused: answers.other.slice(0, 5),
    },
  );
  step(
    'every player sequence contiguous, 1 to N, nothing doubled',
    Object.entries(before).every(([key, s]) => JSON.stringify(s) === JSON.stringify(expectedOf(key))),
    {
      players: Object.keys(before).length,
      perPlayer: N,
    },
  );
  for (let w = 0; w < 20 && streamed.length < N; w++) await sleep(500);
  stream.destroy();
  step(
    'a stream held on bridge-1 received what the other instances accepted, in order, once',
    JSON.stringify(streamed) === JSON.stringify(expected),
    {
      received: streamed.length,
    },
  );

  // Tenants: neither's capability nor token works on the other.
  const crossRead = await https(PORT, 'GET', '/v1/signals', { tenant: 'b', bearer: players.a[0].cap });
  const code = (await https(PORT, 'POST', '/v1/pairings', { tenant: 'b', body: { gameId: 'qualify' } })).json?.code;
  const crossToken = await https(PORT, 'POST', `/v1/pairings/${code}/confirm`, { tenant: 'b', bearer: tokens.a });
  step(
    "a tenant's capability and connector token refused by the other tenant",
    crossRead.status >= 400 && crossToken.status >= 400,
    {
      read: crossRead.status,
      confirm: crossToken.status,
    },
  );

  // ------------------------------------------------ the leaderboard, its workers, Daily and Mystery (4.1.19, plan §9)
  const A = { tenant: 'a' };
  // Daily: one token for the day, whichever instance signs it first.
  const days = await Promise.all([1, 2, 3].map((i) => insist(PORT + i, 'GET', '/v1/daily?game=reference', A)));
  step(
    'the daily token is the same on the three instances',
    days.every((d) => d.status === 200 && d.json?.token) && new Set(days.map((d) => d.json.token)).size === 1,
    { statuses: days.map((d) => d.status) },
  );
  // Mystery: committed on one instance, revealed on the two others, the reveal written once.
  const commit = await insist(PORT + 1, 'POST', '/v1/commit', { ...A, body: { game: 'reference' } });
  const reveals = await Promise.all([2, 3].map((i) => insist(PORT + i, 'GET', `/v1/reveal/${commit.json?.id}`, A)));
  step(
    'a Mystery committed on one instance is revealed alike on the others',
    commit.status === 201 &&
      reveals.every((r) => r.status === 200 && r.json?.seed) &&
      new Set(reveals.map((r) => `${r.json?.seed}|${r.json?.nonce}|${r.json?.revealedAt}`)).size === 1,
    { commit: commit.status, reveals: reveals.map((r) => r.status) },
  );
  // A run: submitted on bridge-1, verified by a worker, read on bridge-3; the same run again is a duplicate.
  // Read every 1.5 s at most: each instance gives one client address 60 anonymous requests a minute, then 429.
  const runOf = async (id, port = PORT + 3, until = (r) => r.json?.status === 'done', seconds = 240) => {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      const r = await insist(port, 'GET', `/v1/runs/${id}`, A);
      if (until(r)) return r;
      await sleep(r.status === 429 ? 5000 : 1500);
    }
    throw new Error(`run ${id}: not as expected in ${seconds} s`);
  };
  const submit = (port, player = 'qualifier') => insist(port, 'POST', '/v1/runs', { ...A, body: { player, envelope } });
  const first = await submit(PORT + 1);
  const done = await runOf(first.json?.id);
  step('a run submitted on one instance is verified by a worker and read on another', done.json?.verdict === 'valid', {
    submitted: first.status,
    verdict: done.json?.verdict,
    code: done.json?.code,
    trust: done.json?.trust,
  });
  const dup = await submit(PORT + 2, 'someone-else');
  step('the same run on another instance is a duplicate', dup.status === 409, { status: dup.status });
  // Moderation: refused without the token file's bearer, accepted with it, counted.
  const refusedMod = await insist(PORT + 2, 'POST', `/v1/runs/${first.json?.id}/moderate`, {
    ...A,
    bearer: 'x'.repeat(48),
  });
  const moderated = await insist(PORT + 2, 'POST', `/v1/runs/${first.json?.id}/moderate`, { ...A, bearer: moderator });
  step(
    "a moderator's bearer ranks the run; another bearer is refused",
    refusedMod.status === 401 &&
      moderated.status === 200 &&
      (await runOf(first.json?.id)).json?.trust === 'moderator-verified',
    { refused: refusedMod.status, accepted: moderated.status },
  );
  // A worker's instance killed while it verifies: bridge-2 and bridge-3 paused, the run claimed by bridge-1, bridge-1
  // killed mid-verification, the others resumed: one of them takes the run when its lease ends and verifies it once.
  // The run counted once already: a second run of the same envelope needs the first deleted (its delete token).
  const del = await https(PORT + 1, 'DELETE', `/v1/runs/${first.json?.id}`, {
    ...A,
    deleteToken: first.json?.deleteToken,
  });
  dc(['pause', 'bridge-2', 'bridge-3']);
  const again = await submit(PORT + 1, 'resubmitted');
  let claimed = false;
  try {
    claimed =
      (await runOf(again.json?.id, PORT + 1, (r) => r.json?.status === 'verifying', 60)).json?.status === 'verifying';
  } catch {
    /* said below */
  }
  dc(['kill', 'bridge-1']);
  dc(['unpause', 'bridge-2', 'bridge-3']);
  const taken = await runOf(again.json?.id, PORT + 2, (r) => r.json?.status === 'done', 300);
  dc(['up', '-d', '--wait', 'bridge-1']);
  const copies = dc([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'bridge',
    '-tAc',
    `SELECT COUNT(*) FROM runs WHERE tenant_id = 'a' AND id = '${String(again.json?.id).replace(/[^\w-]/g, '')}'`,
  ]).stdout.trim();
  step(
    'a run whose instance was killed while it verified it is verified once by another instance',
    del.status === 204 && claimed && taken.json?.verdict === 'valid' && copies === '1',
    { deleted: del.status, claimedByTheKilled: claimed, verdict: taken.json?.verdict, rows: copies },
  );
  // The quota, one bucket for the three instances: submissions spread over them, refused past RUNS_PER_MINUTE.
  await sleep(61_000);
  const seen = [];
  for (let i = 0; i < 3 * RUNS_PER_MINUTE; i++) {
    const port = PORT + 1 + (i % 3);
    const r = await insist(port, 'POST', '/v1/runs', { ...A, body: { player: 'quota', envelope: 'not a run' } });
    seen.push({ port, status: r.status });
    if (r.status === 429) break;
  }
  const before429 = seen.filter((s) => s.status !== 429);
  step(
    'the submission quota is one for the three instances',
    seen.at(-1)?.status === 429 &&
      before429.length <= RUNS_PER_MINUTE &&
      new Set(before429.map((s) => s.port)).size >= 2,
    { allowed: before429.length, perMinute: RUNS_PER_MINUTE, instances: new Set(before429.map((s) => s.port)).size },
  );
  // The leaderboard after volume: 20 000 verified runs written in SQL, the board read through the proxy.
  dc([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'bridge',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) SELECT 'a', 'vol_' || g, 'reference', 'any%', 'p' || (g % 5000), 1700000000000 + g, 'done', 'valid', 'replay-valid', (150000000 + ((g * 104729) % 50000000))::text, 'any%', 'vol-' || g, repeat('0', 64), '' FROM generate_series(1, 20000) AS g; ANALYZE runs;",
  ]);
  const times = [];
  let board = null;
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    board = await insist(PORT, 'GET', '/v1/runs?game=reference&category=any%25', A);
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const p95 = Math.round(times[Math.floor(times.length * 0.95) - 1]);
  const rows = board?.json?.runs ?? board?.json?.rows ?? board?.json;
  step('the leaderboard after 20 000 runs answers through the proxy', board?.status === 200 && p95 < 1500, {
    p95Ms: p95,
    rows: Array.isArray(rows) ? rows.length : null,
  });
  const boardBefore = JSON.stringify(board?.json);
  const dailyBefore = days[0].json?.token;

  // Backup, the topology destroyed with its database, brought up empty, restore, compared.
  const backup = dc([
    'exec',
    '-T',
    'bridge-1',
    'sh',
    '-c',
    'node /opt/bridge/bin.mjs backup --dir=/srv/bridge/a --out=/tmp/backup.json >&2 && cat /tmp/backup.json',
  ]).stdout;
  // Beside the run's own files, never in the uploaded folder: it holds every tenant's data.
  const backups = join(base, 'backup');
  mkdirSync(backups, { mode: 0o700 });
  writeFileSync(join(backups, 'backup.json'), backup, { mode: 0o600 });
  dc(['down', '-v'], { stdio: 'inherit' });
  // The documented recovery (REALITY-OPS): a new, empty database first, the backup restored into it by a one-off
  // container of the same image, then the instances (started first, they would register their tenants: not empty).
  dc(['up', '-d', '--wait', 'postgres'], { stdio: 'inherit' });
  dc(
    [
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '-v',
      `${backups}:/backup:ro`,
      'bridge-1',
      'restore',
      '--dir=/srv/bridge/a',
      '--from=/backup/backup.json',
    ],
    { stdio: 'inherit' },
  );
  up();
  await readyCa();
  const after = {};
  for (const t of ['a', 'b']) for (const p of players[t]) after[`${t}/${p.id}`] = await signalsOf(t, p.cap);
  step(
    "backup, the topology and its database destroyed, restore: every player's signed signals as before",
    JSON.stringify(after) === JSON.stringify(full) && Object.values(after).every((x) => x?.signals?.length),
    {
      players: Object.keys(after).length,
    },
  );
  const boardAfter = await insist(PORT, 'GET', '/v1/runs?game=reference&category=any%25', A);
  const dailyAfter = await insist(PORT + 2, 'GET', '/v1/daily?game=reference', A);
  const modAfter = await insist(PORT + 3, 'GET', `/v1/runs/${again.json?.id}`, A);
  step(
    'backup schema 3 and restore: the leaderboard, the daily token and the runs as before',
    JSON.stringify(boardAfter.json) === boardBefore &&
      dailyAfter.json?.token === dailyBefore &&
      modAfter.json?.verdict === 'valid',
    { board: boardAfter.status, daily: dailyAfter.status, run: modAfter.status },
  );
  const next = await insist(PORT, 'POST', '/v1/signals', {
    tenant: 'a',
    bearer: tokens.a,
    body: { playerId: players.a[0].id, signal: 'letter.unclear', source: 'email', dedupeKey: 'after-restore' },
  });
  const old = await insist(PORT, 'POST', '/v1/signals', {
    tenant: 'a',
    bearer: tokens.a,
    body: { playerId: players.a[0].id, signal: 'letter.unclear', source: 'email', dedupeKey: `a-${players.a[0].id}-0` },
  });
  step(
    'after the restore a proposal sent before is still a duplicate',
    old.status === 200 && old.json?.duplicate === true,
    {
      status: old.status,
    },
  );
  step(
    'after the restore a new proposal continues the sequence',
    next.status === 202 && next.json?.sequence === N + 1,
    {
      status: next.status,
      sequence: next.json?.sequence,
    },
  );

  // ------------------------------------------------ a store made by the published 4.1.17 Bridge (plan §9)
  // Its archive, checked against the SHA-256 its release published, installed beside this run (it has no lock: the
  // install of an older release, as an operator made it), run in a one-off container of the same base image on the
  // store's network: it makes its schema in a database of its own, a run is written there in its shape, then this
  // Bridge reads that store. 4.1.17 and this Bridge share schema 4: nothing is migrated, which is what is checked.
  const OLD_SHA = 'a362ca2bbba48d06593d265ad4d6b01efdbc92d95b7165d988c5c2dffbe33d6f';
  const got = await fetch('https://github.com/wanoo/web-scumm/releases/download/v4.1.17/web-scumm-bridge-4.1.17.tgz');
  const oldBytes = Buffer.from(await got.arrayBuffer());
  if (createHash('sha256').update(oldBytes).digest('hex') !== OLD_SHA)
    throw new Error('web-scumm-bridge-4.1.17.tgz: not the archive the 4.1.17 release published');
  const oldDir = join(base, 'bridge-4.1.17');
  mkdirSync(oldDir);
  writeFileSync(join(base, 'bridge-4.1.17.tgz'), oldBytes);
  sh('tar', ['-xzf', join(base, 'bridge-4.1.17.tgz'), '-C', oldDir, '--strip-components=1']);
  sh('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: oldDir });
  sh('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', 'pg@8.23.1'], { cwd: oldDir });
  dc(['exec', '-T', 'postgres', 'createdb', '-U', 'bridge', 'bridge4117']);
  const oldUrl = `postgres://bridge:${pw}@postgres:5432/bridge4117`;
  const made = sh(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'web-scumm-qualify_store',
      '--user',
      `${env.QUALIFY_UID}:${env.QUALIFY_GID}`,
      '-v',
      `${oldDir}:/old:ro`,
      '-v',
      `${join(data, 'a')}:/srv/bridge/a:ro`,
      '--read-only',
      '--tmpfs',
      '/tmp',
      from[0],
      'node',
      '/old/bin.mjs',
      'migrate',
      '--dir=/srv/bridge/a',
      `--store=${oldUrl}`,
    ],
    { allowFail: true },
  );
  dc([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'bridge',
    '-d',
    'bridge4117',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) VALUES ('a', 'run_4117', 'reference', 'any%', 'old', 1700000000000, 'done', 'valid', 'replay-valid', '0042', 'any%', 'k4117', repeat('0', 64), '')",
  ]);
  const read = (cmd) =>
    dc(['run', '--rm', '--no-deps', '-T', 'bridge-1', cmd, '--dir=/srv/bridge/a', `--store=${oldUrl}`], {
      allowFail: true,
    });
  const doctor = read('doctor');
  const migrated = read('migrate');
  step(
    'a store made by the 4.1.17 Bridge read by this one (schema 4, nothing to migrate)',
    made.status === 0 && /schema 4/.test(doctor.stdout + doctor.stderr) && /nothing to do/.test(migrated.stdout),
    {
      made: made.status,
      doctor: (doctor.stdout + doctor.stderr).trim().split('\n').slice(-2).join(' | ').slice(0, 300),
      migrate: migrated.stdout.trim().slice(0, 120),
    },
  );
} catch (e) {
  failedHard = e;
  step('the qualification ran to its end', false, { error: String(e.message ?? e).slice(0, 400) });
  try {
    console.error(dc(['logs', '--no-color', '--tail', '60'], { allowFail: true }).stdout);
  } catch {
    /* no logs */
  }
} finally {
  if (!args.includes('--keep')) dc(['down', '-v'], { allowFail: true });
  writeFileSync(join(out, 'ops-qualify.json'), `${JSON.stringify(report, null, 1)}\n`);
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
}
const bad = steps.filter((s) => !s.ok);
console.log(
  `\n${bad.length ? '✖' : '✔'}  ops:qualify: ${steps.length - bad.length}/${steps.length} steps; report ${join(out, 'ops-qualify.json')}`,
);
process.exit(bad.length || failedHard ? 1 : 0);
