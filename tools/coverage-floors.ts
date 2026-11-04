// The coverage floors (4.6.0, #405): tests/coverage-floors.json, flattened as Vitest's `coverage.thresholds` (the
// global floors, then each group's files), without the reasons. vite.config.ts and tools/coverage-ratchet.ts read
// them here. The file is data read at run time, not an import: tools/mutate.ts never hashes it, so raising a floor
// re-runs no mutation set (a floor cannot change whether a mutant is killed).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FLOORS = 'tests/coverage-floors.json';

type Floor = Partial<Record<'lines' | 'statements' | 'functions' | 'branches', number>>;
interface FloorsFile {
  total: Floor & { why?: string };
  groups: { why: string; files: Record<string, Floor> }[];
}

export function coverageFloors(
  file = fileURLToPath(new URL(`../${FLOORS}`, import.meta.url)),
): Record<string, number | Floor> {
  const { total, groups } = JSON.parse(readFileSync(file, 'utf8')) as FloorsFile;
  const { why: _why, ...global } = total;
  return { ...global, ...Object.assign({}, ...groups.map((g) => g.files)) };
}
