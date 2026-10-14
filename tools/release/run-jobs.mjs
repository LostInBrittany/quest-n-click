// node tools/release/run-jobs.mjs --repo=<owner/name> --run=<id> --out=<jobs.json> (4.1.20 PR 3b): a run's jobs, as
// the candidate's baseline reads them. On 13 October GitHub's jobs listing answered HTTP 502 to two calls in three for
// an hour, and a gate whose every job was green failed four times on one `gh api` call. A 5xx or a 429 is tried again
// (`fetchRetry`); every page is read, a candidate running more than 100 jobs; a listing that does not add up to its
// `total_count` is an error, never a baseline with jobs missing. Any other answer (a 404, a 403) is an error at once.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { backoff, fetchRetry } from './fetch-retry.mjs';

const PER = 100;

/** Every job of the run's latest attempt: `{ total_count, jobs }`, as the API's one page would have been. */
export async function runJobs({ api = 'https://api.github.com', repo, run, token, tries = 5, waitMs = backoff }) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const url = `${api}/repos/${repo}/actions/runs/${run}/jobs?per_page=${PER}&page=${page}`;
    const r = await fetchRetry(url, {
      tries,
      waitMs,
      init: { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` } },
    });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const body = await r.json();
    jobs.push(...body.jobs);
    if (body.jobs.length < PER || jobs.length >= body.total_count) {
      if (jobs.length !== body.total_count)
        throw new Error(`run ${run}: the API listed ${jobs.length} of ${body.total_count} jobs`);
      return { total_count: body.total_count, jobs };
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const [repo, run, out] = [arg('repo'), arg('run'), arg('out')];
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !run || !out || !token) {
    console.error('usage: GH_TOKEN=… run-jobs.mjs --repo=<owner/name> --run=<id> --out=<jobs.json>');
    process.exit(2);
  }
  try {
    const r = await runJobs({ api: process.env.GITHUB_API_URL, repo, run, token });
    writeFileSync(out, `${JSON.stringify(r)}\n`);
    console.log(`✔  ${r.jobs.length} jobs of run ${run}`);
  } catch (e) {
    console.error(`✖  ${e.message}`);
    process.exit(1);
  }
}
