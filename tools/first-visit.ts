// The first visit's JavaScript in bytes (4.6.0, #405): the gzipped size of the chunks index.html loads, held to the
// game's `assetBudgets.initialJsKB` unrounded (verify:dist), and compared with the release's baseline as a warning
// (quality:baseline). Rounded to the KB, the gate depended on where a build sat against a 0.5 KB edge: one byte could
// fail a pull request and 500 could pass.

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const plural = (n: number) => `${n} byte${Math.abs(n) === 1 ? '' : 's'}`;

/** A size as a person reads it: KB with one decimal, and the bytes. */
export const firstVisitSize = (bytes: number) => `${kb(bytes)} gzipped (${bytes} bytes)`;

/** The problem when the first visit is over the game's budget (`initialJsKB` × 1024 bytes), else undefined. */
export function overBudget(bytes: number, budgetKB: number | undefined): string | undefined {
  if (budgetKB === undefined) return undefined;
  const budget = Math.round(budgetKB * 1024);
  return bytes > budget
    ? `first visit's JavaScript: ${firstVisitSize(bytes)}, ${plural(bytes - budget)} over initialJsKB ${budgetKB} (${budget} bytes)`
    : undefined;
}

/** What moved since the release's baseline, in bytes, or undefined when nothing did. A warning, never a failure. */
export function sinceRelease(release: number, now: number): string | undefined {
  const d = now - release;
  if (!d) return undefined;
  return `first visit's JavaScript: ${d > 0 ? '+' : '−'}${plural(Math.abs(d))} since the release (${kb(release)} → ${kb(now)} gzipped)`;
}
