// Mutation sets cut into shards (4.1.20 PR 2a, plan §7.3): `connectors-edge` alone ran 2 h 02 on a runner, more than a
// candidate's budget. A shard mutates whole files of its set, chosen by a deterministic cut balanced on the mutants each
// file holds; the shards' reports are merged into the set's report (`.cache/mutation/report-<set>.json`, the one the
// gates, the baseline and the summaries already read) by `mergeReports`, which refuses any shard missing, doubled,
// cancelled, of other inputs, of another cut or of another set (a commit apart is fine: the same inputs, reused). `mutationMatrix` is the one matrix
// the workflows run (ci, candidate, nightly, release): no workflow writes its list of sets by hand.
import { type KnownSurvivor, type MutationReport, sameMutant } from './mutate';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './game';
import { GATED, type MutationSet, SETS, SHARDS } from './mutation-sets';

/** A shard's report: the set's report for its files only, with the cut it ran and the inputs of that cut. */
export interface ShardReport extends MutationReport {
  shard: { index: number; total: number; files: string[]; inputHash: string };
}

/**
 * The files of each of `n` shards: the largest files first, each given to the shard holding the fewest mutants so far
 * (ties to the lowest shard), each shard's list sorted. The same files and counts always give the same cut.
 */
export function shardFiles(files: string[], n: number, mutantsOf: (file: string) => number): string[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`a set runs in at least one shard, not ${n}`);
  if (n > files.length) throw new Error(`${n} shards for ${files.length} file(s): a shard mutates whole files`);
  const order = [...files].sort((a, b) => mutantsOf(b) - mutantsOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const cut: string[][] = Array.from({ length: n }, () => []);
  const load = new Array<number>(n).fill(0);
  for (const f of order) {
    const i = load.indexOf(Math.min(...load));
    cut[i]!.push(f);
    load[i]! += mutantsOf(f);
  }
  return cut.map((fs) => fs.sort());
}

/** What the merge expects of a set: the cut the commit gives, its inputs, and the equivalent mutants named. */
export interface ExpectedSet {
  set: MutationSet;
  inputHash: string;
  shards: string[][];
  known: KnownSurvivor[];
}

/**
 * The shards' reports merged into the set's report. Throws on a shard missing (a job cancelled or never uploaded),
 * given twice, of other inputs, of another cut or set: a gate never passes on a part of its set (shards of one inputs
 * measured on two commits are one measure, the cache's reuse). The merged
 * report fails when a shard failed or when a survivor is named by no entry of docs/dev/mutants.json.
 */
export function mergeReports(reports: ShardReport[], e: ExpectedSet): MutationReport & { shards: string[] } {
  const n = e.shards.length;
  const byIndex = new Map<number, ShardReport>();
  for (const r of reports) {
    const at = `shard ${r.shard?.index}/${n}`;
    if (r.v !== 1 || !r.shard) throw new Error(`a report of set ${r.set} is not a shard's report`);
    if (r.set !== e.set) throw new Error(`${at} is of set ${r.set}, not ${e.set}`);
    if (r.shard.total !== n) throw new Error(`shard ${r.shard.index} is one of ${r.shard.total}, not ${n}`);
    if (byIndex.has(r.shard.index)) throw new Error(`${at} is given twice`);
    if (r.inputHash !== e.inputHash)
      throw new Error(`${at} measured other inputs (${r.inputHash}, not ${e.inputHash})`);
    const want = e.shards[r.shard.index - 1];
    if (!want || want.join('\n') !== [...r.shard.files].sort().join('\n'))
      throw new Error(`${at} holds other files than the cut gives`);
    if (r.results.some((x) => !want.includes(x.file))) throw new Error(`${at} judged a file outside its cut`);
    byIndex.set(r.shard.index, r);
  }
  for (let i = 1; i <= n; i++) if (!byIndex.has(i)) throw new Error(`shard ${i}/${n} is missing`);
  const shards = [...byIndex.keys()].sort((a, b) => a - b).map((i) => byIndex.get(i)!);
  const results = shards.flatMap((r) => r.results);
  const unexplained = results.filter((r) => r.status === 'survived' && !e.known.some((k) => sameMutant(r, k)));
  return {
    v: 1,
    set: e.set,
    inputHash: e.inputHash,
    // Shards of the same inputs may come from different commits (a report reused from the cache, 4.1.8: the key is the
    // inputs, never the commit); the merged report says each, and the baseline says it was reused.
    commitSha: [...new Set(shards.map((r) => r.commitSha))].join(','),
    at: shards
      .map((r) => r.at)
      .sort()
      .at(-1)!,
    status: shards.every((r) => r.status === 'passed') && !unexplained.length ? 'passed' : 'failed',
    killed: results.filter((r) => r.status !== 'survived').length,
    total: results.length,
    results,
    shards: shards.map((r) => r.shard.inputHash),
  };
}

/** One job of the matrix: a shard of a set. `name` names the job and its artifact. */
export interface MatrixEntry {
  set: MutationSet;
  shard: number;
  shards: number;
  pg: boolean;
  name: string;
}

/**
 * The minutes each shard's job takes cold on a GitHub runner, every mutant run (#410 PR 4): the matrix starts the
 * longest first, so the 8 jobs a candidate runs at a time end together (114 min in the matrix's former order on 5
 * November 2026, 81 modelled this way). Only an order: a wrong figure costs time, never a check.
 * In tools/mutation-minutes.json, read here at run time rather than imported, so it is no input of any set's hash:
 * refreshing it re-runs no set (tests/mutate-hash.test.ts). Measured on 4.7.0's first candidate (run 42034234870,
 * every shard cold); rebuilt from a cold run (a nightly measures fresh) with `gh run view <id> --repo
 * Quest-n-Click/quest-n-click --json jobs | npx tsx tools/mutation-shards.ts --minutes > tools/mutation-minutes.json`.
 * A shard added or a cut changed in SHARDS fails tests/mutate-shards.test.ts until the file has its line.
 */
export const MINUTES: Record<string, number> = JSON.parse(
  readFileSync(resolve(ROOT, 'tools/mutation-minutes.json'), 'utf8'),
);

/**
 * The matrix the workflows run (`npx tsx tools/mutation-shards.ts --matrix=gated`, .github/workflows/mutation-run.yml):
 * every shard of every gated set. Longest first by MINUTES (#410 PR 4), the name breaking a tie: GitHub starts a
 * matrix's jobs in its order, `max-parallel` at a time.
 */
export function mutationMatrix(): { include: MatrixEntry[] } {
  return {
    include: GATED.flatMap((set) => {
      const shards = Math.min(SHARDS[set] ?? 1, SETS[set].length);
      return Array.from({ length: shards }, (_, i) => ({
        set,
        shard: i + 1,
        shards,
        pg: set === 'reality-store-postgres',
        name: `${set}-${i + 1}of${shards}`,
      }));
    }).sort(
      (a, b) => (MINUTES[b.name] ?? 0) - (MINUTES[a.name] ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    ),
  };
}

/** A job of `gh run view <id> --json jobs`, the fields `minutesOf` reads. */
export interface RunJob {
  name: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
}

/**
 * MINUTES from a run's jobs (#410 PR 4): each `mutation / mutation (<shard>)` job's minutes (`mutation (<shard>)` in a
 * run before mutation-run.yml, #525), rounded up. Run it on a cold run (a nightly, `--fresh`): a shard whose report was
 * reused takes a minute and would be ordered last.
 */
export function minutesOf(jobs: readonly RunJob[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) {
    const m = /^(?:mutation \/ )?mutation \((.+)\)$/.exec(j.name);
    if (!m || !j.startedAt || !j.completedAt) continue;
    out[m[1]!] = Math.max(1, Math.ceil((Date.parse(j.completedAt) - Date.parse(j.startedAt)) / 60_000));
  }
  return out;
}

// `npx tsx tools/mutation-shards.ts --matrix=gated` prints the matrix as JSON (mutation-run.yml's
// `fromJSON(needs.plan.outputs.matrix)`); `--sets=gated` the sets, one per line (its merge's loop).
if (process.argv[1]?.endsWith('mutation-shards.ts')) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (process.argv.includes('--minutes')) {
    const { jobs } = JSON.parse(readFileSync(0, 'utf8')) as { jobs: RunJob[] };
    const table = Object.entries(minutesOf(jobs)).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
    console.log(JSON.stringify(Object.fromEntries(table), null, 2));
    process.exit(0);
  }
  const kind = arg('matrix') ?? arg('sets');
  if (kind !== 'gated') {
    console.error(
      'usage: tsx tools/mutation-shards.ts --matrix=gated | --sets=gated | --minutes < jobs.json > tools/mutation-minutes.json',
    );
    process.exit(2);
  }
  const m = mutationMatrix();
  console.log(arg('matrix') ? JSON.stringify(m) : [...new Set(m.include.map((e) => e.set))].join('\n'));
}
