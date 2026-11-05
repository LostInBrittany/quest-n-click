// A download from GitHub's releases tried again on a transient answer (4.1.20 PR 3): candidate 38236552662's
// external-consumer lines met an HTTP 504 on two runners at once (12 October, 14:17:17) and failed the gate on a
// download that a second try would have made. A 5xx, a 429 or a network error is tried again, at most `tries` times;
// any other answer (a 404 names a wrong URL) is given back at once.
// (next, #410): the 4.7.0 candidate's five 504s in a minute ran the tries out without a word. Each failed try is said,
// the default budget is seven tries over about three minutes, and `download` throws on what is not a 2xx in the end.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { backoff, download, fetchRetry } from '../tools/release/fetch-retry.mjs';

const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((ok) => s.close(ok));
});
/** A server answering each request with the next status of `statuses` (the last one again past the end). */
async function answering(statuses: number[]): Promise<{ url: string; hits: () => number }> {
  let n = 0;
  const s = createServer((_req, res) => {
    const status = statuses[Math.min(n++, statuses.length - 1)]!;
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(status === 200 ? 'the archive' : `status ${status}`);
  });
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/a.tgz`, hits: () => n };
}
const now = { wait: async () => {}, tell: () => {} };

describe('fetchRetry', () => {
  it('tries a 504 again, then gives the 200', async () => {
    const s = await answering([504, 200]);
    const r = await fetchRetry(s.url, now);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('the archive');
    expect(s.hits()).toBe(2);
  });

  it('tries a 429 and any 5xx again, at most `tries` times, then gives the last answer', async () => {
    const s = await answering([429, 500, 502, 503]);
    const r = await fetchRetry(s.url, { ...now, tries: 4 });
    expect(r.status).toBe(503);
    expect(s.hits()).toBe(4);
  });

  it('gives a 404 at once: a wrong URL is not tried again', async () => {
    const s = await answering([404, 200]);
    expect((await fetchRetry(s.url, now)).status).toBe(404);
    expect(s.hits()).toBe(1);
  });

  it('tries a refused connection again, then throws what the last try met', async () => {
    const s = await answering([200]);
    const url = s.url;
    await new Promise((ok) => servers.pop()!.close(ok));
    const waits: number[] = [];
    await expect(fetchRetry(url, { ...now, tries: 3, waitMs: (i) => (waits.push(i), 0) })).rejects.toThrow(
      /fetch failed/,
    );
    expect(waits).toEqual([1, 2]);
  });

  it('waits longer each time by default: 5 s doubled, at most a minute, about three minutes in all', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoff)).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it('says each failed try, and nothing when the first one answers (the 4.7.0 candidate ran out silently)', async () => {
    const said: string[] = [];
    const s = await answering([504, 503, 200]);
    expect((await fetchRetry(s.url, { ...now, tries: 7, tell: (l) => said.push(l) })).status).toBe(200);
    expect(said).toEqual([
      `${s.url} answered 504, try 1/7: again in 5 s`,
      `${s.url} answered 503, try 2/7: again in 10 s`,
    ]);
    const ok = await answering([200]);
    said.length = 0;
    await fetchRetry(ok.url, { ...now, tell: (l) => said.push(l) });
    expect(said).toEqual([]);
  });

  it('tries seven times by default', async () => {
    const s = await answering([502]);
    expect((await fetchRetry(s.url, now)).status).toBe(502);
    expect(s.hits()).toBe(7);
  });
});

describe('download', () => {
  it('gives the bytes once a 5xx was tried again', async () => {
    const s = await answering([504, 200]);
    expect((await download(s.url, now)).toString()).toBe('the archive');
    expect(s.hits()).toBe(2);
  });

  it('throws on a 404 at once, naming the URL and the status', async () => {
    const s = await answering([404, 200]);
    await expect(download(s.url, now)).rejects.toThrow(`${s.url}: 404`);
    expect(s.hits()).toBe(1);
  });

  it('throws the last status when every try met a 5xx', async () => {
    const s = await answering([504]);
    await expect(download(s.url, { ...now, tries: 3 })).rejects.toThrow(`${s.url}: 504`);
    expect(s.hits()).toBe(3);
  });

  it('tries a network error again, then gives the bytes', async () => {
    let n = 0;
    const s = createServer((req, res) => {
      if (n++ === 0) return req.socket.destroy();
      res.end('the archive');
    });
    servers.push(s);
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/a.tgz`;
    const said: string[] = [];
    expect((await download(url, { ...now, tell: (l) => said.push(l) })).toString()).toBe('the archive');
    expect(n).toBe(2);
    expect(said[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/a\.tgz failed \(.+\), try 1\/7: again in 5 s$/);
  });
});
