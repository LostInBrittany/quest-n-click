// The coverage floors (4.6.0, #405): tests/coverage-floors.json, flattened as Vitest's `coverage.thresholds` (the
// global floors, then each group's files), without the reasons. vite.config.ts and tools/coverage-ratchet.ts read
// them here. The file is data read at run time, not an import: tools/mutate.ts never hashes it, so raising a floor
// re-runs no mutation set (a floor cannot change whether a mutant is killed).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FLOORS = 'tests/coverage-floors.json';

type Floor = Partial<Record<'lines' | 'statements' | 'functions' | 'branches', number>>;
export interface FloorsFile {
  total: Floor & { why?: string };
  groups: { why: string; files: Record<string, Floor> }[];
}

const HERE = fileURLToPath(new URL(`../${FLOORS}`, import.meta.url));

export function coverageFloors(file = HERE): Record<string, number | Floor> {
  const { total, groups } = JSON.parse(readFileSync(file, 'utf8')) as FloorsFile;
  const { why: _why, ...global } = total;
  return { ...global, ...Object.assign({}, ...groups.map((g) => g.files)) };
}

/**
 * What vite.config.ts gives Vitest as `coverage.thresholds`: the floors for the whole suite; none for one shard
 * (`VITEST_SHARD`: the floors apply to the merged parts), and none where the file is absent. The npm package ships
 * tools/ but not tests/, and a created project's `quest-n-click build` loads vite.config.ts: it never measures the
 * engine's coverage. In this repository, tests/coverage-floors.test.ts holds that the file is there.
 */
export function coverageThresholds(
  env: Record<string, string | undefined> = process.env,
  file = HERE,
): Record<string, number | Floor> | undefined {
  if (env.VITEST_SHARD || !existsSync(file)) return undefined;
  return coverageFloors(file);
}

type Metric = 'lines' | 'statements' | 'functions' | 'branches';
type Summary = Record<string, Partial<Record<Metric, { pct: number }>>>;
/** A floor three points or more under what the tests reach (`where` is `total` or the file's path). */
export interface Slack {
  where: string;
  metric: string;
  floor: number;
  got: number;
}
/** The ratchet's margin: a floor this many points or more under the measure is one to raise. */
export const MARGIN = 3;

/** Every floor of `floors` three points or more under the measure of `summary` (Vitest's json-summary). */
export function ratchetSlack(floors: FloorsFile, summary: Summary): Slack[] {
  const slack: Slack[] = [];
  const say = (where: string, metric: string, floor: number, got: number | undefined) => {
    if (got !== undefined && got - floor >= MARGIN) slack.push({ where, metric, floor, got });
  };
  const { why: _why, ...total } = floors.total;
  for (const [metric, floor] of Object.entries(total))
    say('total', metric, floor as number, summary.total?.[metric as Metric]?.pct);
  for (const group of floors.groups)
    for (const [file, own] of Object.entries(group.files)) {
      const entry = Object.entries(summary).find(([path]) => path.endsWith(`/${file}`) || path === file)?.[1];
      if (!entry) continue;
      for (const [metric, floor] of Object.entries(own))
        say(file, metric, floor as number, entry[metric as Metric]?.pct);
    }
  return slack;
}

/**
 * `coverage-ratchet --write` (4.7.0, #410 PR 2): each floor of `slack` raised to two points under its measure, rounded
 * down (the repository's convention), never lowered; every other field, reason and order kept.
 */
export function raiseFloors(floors: FloorsFile, slack: readonly Slack[]): FloorsFile {
  const out = structuredClone(floors);
  for (const s of slack) {
    const to = Math.floor(s.got) - 2;
    const at =
      s.where === 'total'
        ? (out.total as Floor)
        : out.groups.map((g) => g.files[s.where]).find((f): f is Floor => f !== undefined);
    const key = s.metric as Metric;
    if (at && (at[key] ?? 0) < to) at[key] = to;
  }
  return out;
}

/** The floors file as committed: JSON, one-space indents, a final newline. */
export const floorsText = (floors: FloorsFile) => `${JSON.stringify(floors, null, 1)}\n`;
export const readFloors = (file = HERE) => JSON.parse(readFileSync(file, 'utf8')) as FloorsFile;
