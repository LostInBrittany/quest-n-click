// npx tsx tools/load-median.ts --store=sqlite|postgres --dir=<dir> [--baseline=docs/dev/baselines/load.json]
// [--out=<file>] (4.1.20 PR 3, docs/dev/PLAN-4.1.20-LAST-MILE.md §8.3): three loads of one store, each measuring its p95
// over its many requests (`bridge-load-<store>-{1,2,3}.json`, `runs-load-<store>-{1,2,3}.json`), read as one figure:
// the median of the three p95, with their minimum and maximum, the runner and the protocol named. Compared with a
// baseline of the same runner and the same protocol only: more than 25 % slower is an alert (a warning, said), a
// failure only past the absolute budget or when every one of the three loads is that much slower (the degradation
// reproduced). Three samples are a median to check, not a distribution; the 25 % is a trend, never a looser bound.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The two loads a store is measured by, their absolute budgets (the baseline sheet's), and what makes a protocol. */
export const KINDS = {
  proposals: { file: 'bridge-load', budgetMs: 1000, protocol: ['instances', 'players', 'proposals', 'concurrency'] },
  leaderboard: { file: 'runs-load', budgetMs: 2000, protocol: ['runs', 'players', 'reads'] },
} as const;
export type Kind = keyof typeof KINDS;
/** The trend that raises an alert (and, seen in all three loads, fails). */
export const ALERT = 1.25;

export interface Runner {
  os: string;
  image: string;
}
export interface BaselineEntry {
  p95Ms: number;
  runner: Runner;
  protocol: Record<string, number>;
  /** Where the figure comes from (a candidate run, one load or a median of three). */
  source: string;
}
export type Baseline = Record<string, Partial<Record<Kind, BaselineEntry>>>;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** One kind of load on one store: its three p95 read as a median, compared with the baseline when comparable. */
export function judgeLoad(
  kind: Kind,
  reports: Record<string, unknown>[],
  runner: Runner,
  base: BaselineEntry | undefined,
) {
  const k = KINDS[kind];
  if (reports.length !== 3) throw new Error(`${kind}: ${reports.length} loads, not 3`);
  const p95 = reports.map((r) => Number((r.latencyMs as { p95?: number } | undefined)?.p95));
  if (p95.some((x) => !Number.isFinite(x))) throw new Error(`${kind}: a load has no p95`);
  const protocol = Object.fromEntries(k.protocol.map((f) => [f, Number(reports[0]![f])]));
  for (const r of reports.slice(1))
    for (const f of k.protocol)
      if (Number(r[f]) !== protocol[f]) throw new Error(`${kind}: the three loads ran other protocols (${f})`);
  const m = median(p95);
  const out = {
    p95Ms: p95,
    medianMs: m,
    minMs: Math.min(...p95),
    maxMs: Math.max(...p95),
    budgetMs: k.budgetMs,
    runner,
    protocol,
    baseline: null as null | { p95Ms: number; source: string; ratio: number } | { refused: string },
    alert: false,
    failed: [] as string[],
  };
  if (p95.some((x) => x > k.budgetMs))
    out.failed.push(`a p95 above the budget of ${k.budgetMs} ms (${p95.join(', ')})`);
  if (!base) out.baseline = { refused: 'no baseline for this store and load' };
  else if (base.runner.os !== runner.os || base.runner.image !== runner.image)
    out.baseline = {
      refused: `the baseline ran on ${base.runner.os}/${base.runner.image}, not ${runner.os}/${runner.image}`,
    };
  else if (k.protocol.some((f) => base.protocol[f] !== protocol[f]))
    out.baseline = { refused: `the baseline ran another protocol (${JSON.stringify(base.protocol)})` };
  else {
    const ratio = Math.round((m / base.p95Ms) * 100) / 100;
    out.baseline = { p95Ms: base.p95Ms, source: base.source, ratio };
    out.alert = m > base.p95Ms * ALERT;
    if (p95.every((x) => x > base.p95Ms * ALERT))
      out.failed.push(
        `every load ${Math.round((ALERT - 1) * 100)} % slower than the baseline (${p95.join(', ')} against ${base.p95Ms} ms): reproduced`,
      );
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const store = flag('store');
  const dir = flag('dir') ?? '.';
  if (store !== 'sqlite' && store !== 'postgres') {
    console.error('usage: npx tsx tools/load-median.ts --store=sqlite|postgres --dir=<dir> [--baseline=] [--out=]');
    process.exit(2);
  }
  const baseFile = flag('baseline') ?? 'docs/dev/baselines/load.json';
  const baseline = (existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')).stores : {}) as Baseline;
  const runner = { os: process.env.RUNNER_OS ?? process.platform, image: process.env.ImageOS ?? 'local' };
  const result: Record<string, unknown> = { format: 'web-scumm-load-median', schema: 1, store, runner };
  let code = 0;
  for (const kind of Object.keys(KINDS) as Kind[]) {
    const reports = [1, 2, 3].map((i) =>
      JSON.parse(readFileSync(join(dir, `${KINDS[kind].file}-${store}-${i}.json`), 'utf8')),
    );
    const r = judgeLoad(kind, reports, runner, baseline[store]?.[kind]);
    result[kind] = r;
    const vs =
      r.baseline && 'ratio' in r.baseline
        ? `, ×${r.baseline.ratio} the baseline`
        : ` (${(r.baseline as { refused: string }).refused})`;
    console.log(
      `${r.failed.length ? '✖' : '✔'}  ${store} ${kind}: median p95 ${r.medianMs} ms (${r.minMs}–${r.maxMs})${vs}`,
    );
    if (r.alert)
      console.log(`::warning::${store} ${kind}: median p95 ${r.medianMs} ms, more than 25 % above the baseline`);
    for (const f of r.failed) console.error(`✖  ${store} ${kind}: ${f}`);
    if (r.failed.length) code = 1;
  }
  if (flag('out')) writeFileSync(flag('out')!, `${JSON.stringify(result, null, 1)}\n`);
  process.exit(code);
}
