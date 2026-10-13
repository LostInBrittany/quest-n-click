// The leaderboard (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs; 4.1.19, plan §9): the daily token alike
// on the three instances, a Mystery committed on one and revealed on the others, a run verified by a worker and read
// elsewhere, its duplicate, a moderator, an instance killed while its worker verifies, one quota for the three
// instances, and the board after volume.
import { sleep } from './steps.mjs';

export async function runs(c) {
  const { PORT, SHORT, step, dc, https, insist, sql, moderator, RUNS_PER_MINUTE, envelope } = c;
  // ------------------------------------------------ the leaderboard, its workers, Daily and Mystery (4.1.19, plan §9)
  const A = { tenant: 'a' };
  // Daily: one token for the day, whichever instance signs it first.
  // The day named (a run across midnight UTC asks for one day), and the token read in the store: Ed25519 signs a payload
  // without a time, so three instances would agree even without a store (second reading of 4.1.19 PR 5).
  const DAY = new Date().toISOString().slice(0, 10);
  const dailyRow = () => sql(`SELECT v FROM daily_kv WHERE k LIKE '%daily|reference|${DAY}'`);
  const days = await Promise.all(
    [1, 2, 3].map((i) => insist(PORT + i, 'GET', `/v1/daily?game=reference&date=${DAY}`, A)),
  );
  const dailyBefore = days[0].json?.token;
  const storedDaily = dailyRow();
  step(
    'the daily token is the same on the three instances, written once in the store',
    !!dailyBefore &&
      days.every((d) => d.status === 200 && d.json?.token === dailyBefore) &&
      storedDaily.includes(dailyBefore),
    { statuses: days.map((d) => d.status), stored: storedDaily.length > 0 },
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
    reason: String(done.json?.reason ?? '').slice(0, 200),
  });
  const dup = await submit(PORT + 2, 'someone-else');
  step('the same run on another instance is a duplicate', dup.status === 409 && dup.json?.error === 'duplicate', {
    status: dup.status,
    error: dup.json?.error,
  });
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
  // Proved, not assumed (second reading of 4.1.19 PR 5): the row is still `verifying` under bridge-1's lease after the
  // kill (else the run was verified before it, and the attempt is made again, three times at most), `done` comes after
  // that lease's end, and one instance alone, never bridge-1, says it verified the run.
  let last = { id: first.json?.id, deleteToken: first.json?.deleteToken };
  let again = null;
  let taken = null;
  let proof = { attempts: 0 };
  for (let attempt = 1; attempt <= 3 && !taken && !SHORT; attempt++) {
    proof = { attempts: attempt };
    const del = await https(PORT + 1, 'DELETE', `/v1/runs/${last.id}`, { ...A, deleteToken: last.deleteToken });
    proof.deleted = del.status;
    dc(['pause', 'bridge-2', 'bridge-3']);
    again = (await submit(PORT + 1, 'resubmitted')).json;
    last = { id: again?.id, deleteToken: again?.deleteToken };
    const safeId = String(again?.id).replace(/[^\w-]/g, '');
    const row = () =>
      sql(
        `SELECT status || '|' || COALESCE(lease_owner, '') || '|' || COALESCE(lease_until, 0) FROM runs WHERE tenant_id = 'a' AND id = '${safeId}'`,
      );
    let claim = '';
    for (let i = 0; i < 300 && !claim; i++) {
      const r = row();
      if (/^verifying\|.+/.test(r)) claim = r;
      else if (r.startsWith('done')) break;
      else await sleep(100);
    }
    dc(['kill', 'bridge-1']);
    const afterKill = row();
    dc(['unpause', 'bridge-2', 'bridge-3']);
    if (!claim || afterKill !== claim) {
      // Verified before the kill: no takeover to see. bridge-1 back, the run deleted, again.
      dc(['up', '-d', '--wait', 'bridge-1']);
      continue;
    }
    const leaseUntil = Number(claim.split('|')[2]);
    const r = await runOf(again?.id, PORT + 2, (x) => x.json?.status === 'done', 300);
    const doneAt = Date.now();
    dc(['up', '-d', '--wait', 'bridge-1']);
    const logs = dc(['logs', '--no-color', 'bridge-1', 'bridge-2', 'bridge-3'], { allowFail: true }).stdout;
    const verified = logs
      .split('\n')
      .filter((l) => l.includes('"event":"run.verified"') && l.includes(`"run":"${again?.id}"`));
    proof = {
      ...proof,
      claimedBy: claim.split('|')[1],
      verdict: r.json?.verdict,
      doneAfterLeaseEnd: doneAt >= leaseUntil,
      verifiedBy: verified.map((l) => l.split('|')[0].trim()),
    };
    taken = r;
  }
  if (!SHORT)
    step(
      'a run whose instance was killed while it verified it is verified once, by another instance, after its lease',
      taken?.json?.verdict === 'valid' &&
        proof.doneAfterLeaseEnd === true &&
        proof.verifiedBy?.length === 1 &&
        !/bridge-1/.test(proof.verifiedBy[0]),
      proof,
    );
  // The quota, one bucket for the three instances: submissions spread over them, refused past RUNS_PER_MINUTE, by the
  // quota itself (the per-address limit answers 429 too, with another message).
  if (!SHORT) await sleep(61_000);
  const seen = [];
  for (let i = 0; i < 3 * RUNS_PER_MINUTE && !SHORT; i++) {
    const port = PORT + 1 + (i % 3);
    const r = await insist(port, 'POST', '/v1/runs', { ...A, body: { player: 'quota', envelope: 'not a run' } });
    seen.push({ port, status: r.status, message: r.json?.message ?? '' });
    if (r.status === 429) break;
  }
  const before429 = seen.filter((s) => s.status !== 429);
  if (!SHORT)
    step(
      'the submission quota is one for the three instances',
      seen.at(-1)?.status === 429 &&
        /too many runs from this client/.test(seen.at(-1)?.message) &&
        before429.length === RUNS_PER_MINUTE &&
        new Set(before429.map((s) => s.port)).size >= 2,
      { allowed: before429.length, perMinute: RUNS_PER_MINUTE, instances: new Set(before429.map((s) => s.port)).size },
    );
  // The leaderboard after volume: 20 000 verified runs written in SQL, the board read through the proxy. (`--short`, the
  // candidate's deployment-smoke: 200.)
  const VOLUME = SHORT ? 200 : 20_000;
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
    `INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) SELECT 'a', 'vol_' || g, 'reference', 'any%', 'p' || (g % 5000), 1700000000000 + g, 'done', 'valid', 'replay-valid', (150000000 + ((g * 104729) % 50000000))::text, 'any%', 'vol-' || g, repeat('0', 64), '' FROM generate_series(1, ${VOLUME}) AS g; ANALYZE runs;`,
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
  step(`the leaderboard after ${VOLUME} runs answers through the proxy`, board?.status === 200 && p95 < 1500, {
    p95Ms: p95,
    rows: Array.isArray(rows) ? rows.length : null,
  });
  const boardBefore = JSON.stringify(board?.json);
  return { DAY, dailyRow, dailyBefore, storedDaily, first, again, boardBefore };
}
