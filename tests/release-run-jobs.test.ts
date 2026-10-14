// The candidate's baseline reads the run's jobs from GitHub's API (4.1.20 PR 3b): on 13 October the jobs listing
// answered HTTP 502 to two calls in three for an hour, while the rest of the API answered, and #120's gate failed four
// times on a step whose every job was green. A 5xx is tried again; every page is read (a candidate runs more than 100
// jobs, and one `per_page=100` call would drop the rest in silence); a listing that does not add up is an error.
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { runJobs } from '../tools/release/run-jobs.mjs';

const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((ok) => s.close(ok));
});
const job = (id: number) => ({
  id,
  name: `job-${id}`,
  started_at: '2026-10-13T20:00:00Z',
  completed_at: '2026-10-13T20:01:00Z',
});

/** A jobs API: `fail` 502s first, then pages of `per` jobs out of `total` (or `claim` as its total_count). */
async function api(o: { total: number; per?: number; fail?: number; claim?: number; status?: number }) {
  const seen: string[] = [];
  let fails = o.fail ?? 0;
  const s = createServer((req, res) => {
    seen.push(req.url ?? '');
    if (o.status) {
      res.writeHead(o.status).end('{"message":"Not Found"}');
      return;
    }
    if (fails-- > 0) {
      res.writeHead(502).end('{"message":"Server Error"}');
      return;
    }
    const u = new URL(req.url ?? '/', 'http://x');
    const per = Number(u.searchParams.get('per_page'));
    const page = Number(u.searchParams.get('page'));
    const from = (page - 1) * per;
    const ids = Array.from({ length: Math.max(0, Math.min(per, o.total - from)) }, (_, i) => from + i + 1);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total_count: o.claim ?? o.total, jobs: ids.map(job) }));
  });
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, seen };
}
const fast = { waitMs: () => 0 };

describe('runJobs', () => {
  it('tries a 502 again, then gives the jobs', async () => {
    const a = await api({ total: 3, fail: 2 });
    const r = await runJobs({ api: a.url, repo: 'o/r', run: '7', token: 't', ...fast });
    expect(r.jobs.map((j) => j.id)).toEqual([1, 2, 3]);
    expect(a.seen).toHaveLength(3);
    expect(a.seen[0]).toBe('/repos/o/r/actions/runs/7/jobs?per_page=100&page=1');
  });

  it('reads every page past 100 jobs', async () => {
    const a = await api({ total: 230 });
    const r = await runJobs({ api: a.url, repo: 'o/r', run: '7', token: 't', ...fast });
    expect(r.total_count).toBe(230);
    expect(r.jobs).toHaveLength(230);
    expect(new Set(r.jobs.map((j) => j.id)).size).toBe(230);
    expect(a.seen).toHaveLength(3);
  });

  it('a 404 is an error at once, never tried again', async () => {
    const a = await api({ total: 1, status: 404 });
    await expect(runJobs({ api: a.url, repo: 'o/r', run: '7', token: 't', ...fast })).rejects.toThrow(/404/);
    expect(a.seen).toHaveLength(1);
  });

  it('a 502 on every try is an error, after the tries', async () => {
    const a = await api({ total: 1, fail: 99 });
    await expect(runJobs({ api: a.url, repo: 'o/r', run: '7', token: 't', tries: 4, ...fast })).rejects.toThrow(/502/);
    expect(a.seen).toHaveLength(4);
  });

  it('a listing that does not add up to its total_count is an error', async () => {
    const a = await api({ total: 3, claim: 5 });
    await expect(runJobs({ api: a.url, repo: 'o/r', run: '7', token: 't', ...fast })).rejects.toThrow(/3 of 5/);
  });
});

describe('the workflows', () => {
  it('read a run’s jobs through run-jobs.mjs, never one bare `gh api …/jobs` call', () => {
    const dir = '.github/workflows';
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml')))
      expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/gh api [^\n]*\/jobs/);
    expect(readFileSync(`${dir}/candidate.yml`, 'utf8')).toMatch(/node tools\/release\/run-jobs\.mjs /);
  });
});
