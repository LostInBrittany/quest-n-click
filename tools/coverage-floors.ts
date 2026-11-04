// The coverage floors (4.6.0, #405): tests/coverage-floors.json, flattened as Vitest's `coverage.thresholds` (the
// global floors, then each group's files), without the reasons. vite.config.ts and tools/coverage-ratchet.ts read
// them here. The file is data read at run time, not an import: tools/mutate.ts never hashes it, so raising a floor
// re-runs no mutation set (a floor cannot change whether a mutant is killed).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FLOORS = 'tests/coverage-floors.json';

type Floor = Partial<Record<'lines' | 'statements' | 'functions' | 'branches', number>>;
interface FloorsFile {
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
