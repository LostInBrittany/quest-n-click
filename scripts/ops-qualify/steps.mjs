// The qualification's steps and its shell (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): each step
// said as it is judged and kept for the report, every command run with its output kept and its failure thrown.
import { spawnSync } from 'node:child_process';

/**
 * Every step, by a stable id (4.1.20 PR 3, plan §8.0): its name may change, its id does not. `short`: whether the short
 * profile (a pull request's) runs it too; the full profile runs them all. `budgetMs`: the time it should take on a
 * GitHub runner, said in the report when passed (never a failure: a slow runner is not a fault of the Bridge).
 */
export const CATALOGUE = [
  { id: 'images-pinned', name: /^every image pinned by digest$/, short: true, budgetMs: 5_000 },
  { id: 'bridge-image', name: /^the Bridge image$/, short: true, budgetMs: 180_000 },
  { id: 'topology-up', name: /^three Bridges and Postgres up behind HTTPS$/, short: true, budgetMs: 240_000 },
  { id: 'players-paired', name: /^six players paired over HTTPS/, short: true, budgetMs: 30_000 },
  { id: 'instance-restarted', name: /^bridge-2 serves again after its restart$/, short: true, budgetMs: 120_000 },
  { id: 'in-flight-once', name: /^proposals in flight on a killed instance/, short: true, budgetMs: 120_000 },
  { id: 'applied-once', name: /^every proposal applied once across a killed instance$/, short: true, budgetMs: 30_000 },
  { id: 'sequences-contiguous', name: /^every player sequence contiguous/, short: true, budgetMs: 10_000 },
  { id: 'stream-in-order', name: /^a stream held on bridge-1 received/, short: true, budgetMs: 15_000 },
  { id: 'tenants-apart', name: /^a tenant's capability and connector token refused/, short: true, budgetMs: 10_000 },
  { id: 'daily-once', name: /^the daily token is the same on the three instances/, short: true, budgetMs: 15_000 },
  { id: 'mystery-revealed', name: /^a Mystery committed on one instance/, short: true, budgetMs: 15_000 },
  { id: 'run-verified', name: /^a run submitted on one instance is verified/, short: true, budgetMs: 240_000 },
  { id: 'run-duplicate', name: /^the same run on another instance is a duplicate$/, short: true, budgetMs: 10_000 },
  { id: 'moderation', name: /^a moderator's bearer ranks the run/, short: true, budgetMs: 30_000 },
  {
    id: 'worker-takeover',
    name: /^a run whose instance was killed while it verified it/,
    short: false,
    budgetMs: 600_000,
  },
  {
    id: 'quota-shared',
    name: /^the submission quota is one for the three instances$/,
    short: false,
    budgetMs: 120_000,
  },
  {
    id: 'board-volume',
    name: /^the leaderboard after \d+ runs answers through the proxy$/,
    short: true,
    budgetMs: 60_000,
  },
  {
    id: 'restore-signals',
    name: /^backup, the topology and its database destroyed, restore/,
    short: true,
    budgetMs: 300_000,
  },
  { id: 'restore-board', name: /^backup and restore: the leaderboard/, short: true, budgetMs: 30_000 },
  {
    id: 'restore-duplicate',
    name: /^after the restore a proposal sent before is still a duplicate$/,
    short: true,
    budgetMs: 10_000,
  },
  {
    id: 'restore-continues',
    name: /^after the restore a new proposal continues the sequence$/,
    short: true,
    budgetMs: 10_000,
  },
  {
    id: 'restore-refused-serving',
    name: /^restore refused at once while the Bridges serve/,
    short: true,
    budgetMs: 30_000,
  },
  { id: 'replace-store', name: /^replace-store, the Bridges stopped/, short: true, budgetMs: 300_000 },
  {
    id: 'store-4117',
    name: /^a store written by the 4\.1\.17 Bridge read by this one/,
    short: false,
    budgetMs: 600_000,
  },
  { id: 'ran-to-end', name: /^the qualification ran to its end$/, short: true, budgetMs: 0 },
];

/** The first thing a failed step says went wrong (its error, its first refusal, else what it measured), shortened. */
function firstDefect(detail) {
  const first = detail.error ?? detail.refused?.[0] ?? detail.reason;
  return String(first ?? JSON.stringify(detail)).slice(0, 300);
}

/**
 * The steps of one run, and `step`, which judges one, says it and keeps it: with its id, the time since the step before
 * (`ms`, the first from `start`), its budget passed or not, and its first defect when it fails. A name the catalogue
 * does not know throws: no step goes into a report without its id.
 */
export function createSteps({ now = () => performance.now(), catalogue = CATALOGUE } = {}) {
  const steps = [];
  let last = now();
  const step = (name, ok, detail = {}) => {
    const entry = catalogue.find((c) => c.name.test(name));
    if (!entry) throw new Error(`ops:qualify: the step "${name}" has no id in scripts/ops-qualify/steps.mjs`);
    const t = now();
    const ms = Math.round(t - last);
    last = t;
    steps.push({
      id: entry.id,
      name,
      ok,
      ms,
      ...(entry.budgetMs && ms > entry.budgetMs ? { overBudgetMs: entry.budgetMs } : {}),
      ...(ok ? {} : { firstDefect: firstDefect(detail) }),
      ...detail,
    });
    console.log(`${ok ? '✔' : '✖'}  ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
    return ok;
  };
  return { steps, step };
}

export const sh = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, {
    encoding: 'utf8',
    // A backup of 20 000 runs is megabytes on stdout: the default buffer (1 MiB) would kill the command.
    maxBuffer: 1 << 28,
    stdio: o.input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    ...o,
  });
  if (r.status !== 0 && !o.allowFail) throw new Error(`${cmd} ${a.join(' ')}: exit ${r.status}\n${r.stderr}`);
  return r;
};

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
