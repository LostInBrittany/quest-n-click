#!/usr/bin/env node
// node tools/release/supersede.mjs (#410 PR 4 e): the candidate's `supersede` job. A candidate started on main for a
// release's version cancels the earlier candidates of that same version that can no longer turn green, so their
// runners go to it: 4.6.0's first candidate ran 72 min after `release-core` failed (330 runner-minutes), 4.7.0's 105
// min after its core mutants (520), while the candidate on the fix waited for runners.
//
// It cancels a run only when every one of these holds: a run of candidate.yml on main (a release's merge or one
// started by hand, never a pull request's), still running, started before this one, named with the SHA it tests
// (`candidate <sha>`, the workflow's run-name; a run named otherwise is left alone), another SHA than this run's,
// package.json at that SHA naming this run's version, and a job of it already failed or timed out. A running run with
// no red job, a completed one, another version's, a pull request's: never.
//
// Env: GH_TOKEN (the job's token, `actions: write`), GITHUB_REPOSITORY, RUN_ID (this run), SHA (the SHA this run
// tests, target's output), EVENT and BRANCH (this run's). It never fails the job (the gate judges every job): a
// problem is a `::warning::` and nothing cancelled.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FULL = /^[0-9a-f]{40}$/;

/** The name candidate.yml gives a run: the SHA it tests (`run-name`). */
export const runName = (sha) => `candidate ${sha}`;

/** The SHA a run's name says, or undefined (a run named before #410, or any other title). */
export function candidateSha(name) {
  const m = /^candidate ([0-9a-f]{40})$/.exec(name ?? '');
  return m ? m[1] : undefined;
}

/**
 * The runs to cancel, with why. `runs`: candidate.yml's runs ({ id, name, event, branch, status, createdAt });
 * `versionOf(sha)`: package.json's version at a SHA (undefined when unread); `failedJobs(id)`: the names of a run's
 * jobs that failed or timed out.
 */
export function superseded({ self, runs, versionOf, failedJobs }) {
  if (!['push', 'workflow_dispatch'].includes(self.event) || self.branch !== 'main' || !self.version) return [];
  const out = [];
  for (const r of runs) {
    if (r.id === self.id || r.status !== 'in_progress') continue;
    if (!['push', 'workflow_dispatch'].includes(r.event) || r.branch !== 'main') continue;
    if (!(r.createdAt < self.createdAt)) continue;
    const sha = candidateSha(r.name);
    if (!sha || sha === self.sha) continue;
    if (versionOf(sha) !== self.version) continue;
    const red = failedJobs(r.id);
    if (!red.length) continue;
    out.push({
      id: r.id,
      sha,
      why: `candidate ${r.id} (${sha.slice(0, 7)}, ${self.version}) is red (${red.join(', ')}) and still running`,
    });
  }
  return out;
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')}: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const self = {
    id: Number(process.env.RUN_ID),
    sha: process.env.SHA ?? '',
    event: process.env.EVENT ?? '',
    branch: process.env.BRANCH ?? '',
    version: '',
    createdAt: '',
  };
  try {
    if (!FULL.test(self.sha)) throw new Error(`not a full SHA: ${self.sha}`);
    self.version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    self.createdAt = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${self.id}`])).created_at;
    const runs = JSON.parse(
      gh(['api', `repos/${repo}/actions/workflows/candidate.yml/runs?status=in_progress&branch=main&per_page=100`]),
    ).workflow_runs.map((r) => ({
      id: r.id,
      name: r.display_title,
      event: r.event,
      branch: r.head_branch,
      status: r.status,
      createdAt: r.created_at,
    }));
    const versionOf = (sha) => {
      try {
        const c = JSON.parse(gh(['api', `repos/${repo}/contents/package.json?ref=${sha}`])).content;
        return JSON.parse(Buffer.from(c, 'base64').toString('utf8')).version;
      } catch {
        return undefined;
      }
    };
    const failedJobs = (id) =>
      JSON.parse(gh(['api', `repos/${repo}/actions/runs/${id}/jobs?per_page=100`]))
        .jobs.filter((j) => ['failure', 'timed_out'].includes(j.conclusion))
        .map((j) => j.name);
    const cancel = superseded({ self, runs, versionOf, failedJobs });
    if (!cancel.length) console.log(`✔ no earlier red candidate of ${self.version} to cancel`);
    for (const c of cancel) {
      try {
        gh(['api', '-X', 'POST', `repos/${repo}/actions/runs/${c.id}/cancel`]);
        console.log(`::notice::cancelled ${c.why}: superseded by this run (${self.sha.slice(0, 7)})`);
      } catch (e) {
        console.log(`::warning::could not cancel ${c.why}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`::warning::no earlier candidate cancelled: ${e.message}`);
  }
}
