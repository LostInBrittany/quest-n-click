/** The archive names (`quest-n-click-bridge`, …) of the published packages that carry their own lock. */
export const LOCKED: string[];
export function archiveEntries(tgz: string): string[];
export function shrinkwrapProblem(name: string, entries: string[], npmVersion: string): string | null;
export function sbomLock(name: string, dir: string): 'own' | 'root';
