// Mutation sets cut into shards (4.1.20 PR 2a, plan §7.3): `connectors-edge` alone ran 2 h 02 on a runner, more than a
// candidate's budget. A shard mutates whole files of its set, chosen by a deterministic cut balanced on the mutants each
// file holds; the shards' reports are merged into the set's report (`.cache/mutation/report-<set>.json`, the one the
// gates, the baseline and the summaries already read) by `mergeReports`, which refuses any shard missing, doubled,
// cancelled, of other inputs, of another cut, of another set or of another commit. `mutationMatrix` is the one matrix
// the workflows run (ci, candidate, nightly, release): no workflow writes its list of sets by hand.
import { type KnownSurvivor, type MutationReport, sameMutant } from './mutate';
import { GATED, MEASURED, type MutationSet, SETS, SHARDS } from './mutation-sets';

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
 * given twice, of other inputs, of another cut or set or commit: a gate never passes on a part of its set. The merged
 * report fails when a shard failed or when a survivor is named by no entry of docs/dev/mutants.json.
 */
export function mergeReports(reports: ShardReport[], e: ExpectedSet): MutationReport & { shards: string[] } {
  const n = e.shards.length;
  const commits = new Set(reports.map((r) => r.commitSha));
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
  if (commits.size > 1) throw new Error(`the shards of ${e.set} were measured on another commit than each other`);
  for (let i = 1; i <= n; i++) if (!byIndex.has(i)) throw new Error(`shard ${i}/${n} is missing`);
  const shards = [...byIndex.keys()].sort((a, b) => a - b).map((i) => byIndex.get(i)!);
  const results = shards.flatMap((r) => r.results);
  const unexplained = results.filter((r) => r.status === 'survived' && !e.known.some((k) => sameMutant(r, k)));
  return {
    v: 1,
    set: e.set,
    inputHash: e.inputHash,
    commitSha: shards[0]!.commitSha,
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
  gated: boolean;
  pg: boolean;
  name: string;
}

/**
 * The matrix the workflows run (`npx tsx tools/mutation-sets.ts --matrix=gated|nightly`): every shard of every gated
 * set; the nightly adds the measured sets, which gate nothing (`continue-on-error: ${{ !matrix.gated }}`).
 */
export function mutationMatrix(kind: 'gated' | 'nightly'): { include: MatrixEntry[] } {
  const sets: [MutationSet, boolean][] = [
    ...GATED.map((s): [MutationSet, boolean] => [s, true]),
    ...(kind === 'nightly' ? MEASURED.map((s): [MutationSet, boolean] => [s, false]) : []),
  ];
  return {
    include: sets.flatMap(([set, gated]) => {
      const shards = Math.min(SHARDS[set] ?? 1, SETS[set].length);
      return Array.from({ length: shards }, (_, i) => ({
        set,
        shard: i + 1,
        shards,
        gated,
        pg: set === 'reality-store-postgres',
        name: `${set}-${i + 1}of${shards}`,
      }));
    }),
  };
}

// `npx tsx tools/mutation-shards.ts --matrix=gated|nightly` prints the matrix as JSON (a workflow's
// `fromJSON(needs.mutation-plan.outputs.matrix)`); `--sets=gated|nightly` the sets, one per line (the merge's loop).
if (process.argv[1]?.endsWith('mutation-shards.ts')) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const kind = arg('matrix') ?? arg('sets');
  if (kind !== 'gated' && kind !== 'nightly') {
    console.error('usage: tsx tools/mutation-shards.ts --matrix=gated|nightly | --sets=gated|nightly');
    process.exit(2);
  }
  const m = mutationMatrix(kind);
  console.log(arg('matrix') ? JSON.stringify(m) : [...new Set(m.include.map((e) => e.set))].join('\n'));
}
