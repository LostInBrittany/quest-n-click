// The signals (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): six players paired over HTTPS, a stream
// held on one instance, proposals through the proxy across a killed instance and in flight on it, every sequence
// contiguous, and the tenants apart.
import { request } from 'node:https';
import { sleep } from './steps.mjs';

export async function signals(c) {
  const { PORT, step, tokens, dc, https, insist, signalsOf } = c;
  const { ca } = c.topology;
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
  return { players, full, N };
}
