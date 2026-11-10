// The mutation verdict, said for the release command (4.7.3, #471). A mutation shard that fails on survivors nobody
// named fails the same way on a re-run: its verdict depends on its inputs alone (`inputHash`). 4.7.2's candidate
// 42527046788 was re-run anyway and spent 72 minutes failing the same six shards again; the survivors had to be dug out
// of the job logs. So a shard that fails on a verdict says it in an annotation of its job (title `mutation verdict`),
// which the release command reads through the check-runs API: such a run is never re-run, and the stop lists the
// survivors. A job that died (runner lost, timeout, cancelled, npm ci) writes no verdict, and is re-run as before.
//
// The annotation is written by candidate.yml's mutation job, in a step after the mutation step, from the shard's report
// (`npx tsx tools/release/mutation-verdict.ts --report=<file> --sha=<sha>`), not by tools/mutate.ts itself: that file is
// an input of every set's hash, and editing it would throw away every cached shard.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The annotation's title: the one thing the release command matches. */
export const VERDICT_TITLE = 'mutation verdict';
/** Lines of a verdict beyond the first that the annotation carries; the job's log has every one. */
export const VERDICT_MAX = 25;

interface Survivor {
  file: string;
  line: number;
  operator: string;
  from: string;
  to: string;
  context: string;
  status: string;
}
interface Named {
  file: string;
  operator: string;
  from: string;
  to: string;
  context?: string;
}

/**
 * What a shard's verdict says, a heading line then one line per item, or undefined when it has none (the job died
 * otherwise). `incomplete` is checkKnown's list (docs/dev/mutants.json entries that do not hold: the same refusal on
 * every try); else the report this job wrote (`status: failed`, of this commit) and its survivors nobody named.
 */
export function shardVerdict(o: {
  report?: unknown;
  known: readonly Named[];
  incomplete: readonly string[];
  sha?: string;
  same: (a: Survivor, b: Named) => boolean;
}): string[] | undefined {
  if (o.incomplete.length)
    return [
      `docs/dev/mutants.json: ${o.incomplete.length} entr${o.incomplete.length === 1 ? 'y does' : 'ies do'} not hold`,
      ...o.incomplete,
    ];
  const r = o.report as
    | {
        status?: string;
        set?: string;
        commitSha?: string;
        results?: Survivor[];
        shard?: { index: number; total: number };
      }
    | undefined;
  if (!r || r.status !== 'failed' || !Array.isArray(r.results)) return undefined;
  if (o.sha && r.commitSha !== o.sha) return undefined;
  const unnamed = r.results.filter((m) => m.status === 'survived' && !o.known.some((k) => o.same(m, k)));
  if (!unnamed.length) return undefined;
  const where = r.shard ? `${r.set} shard ${r.shard.index}/${r.shard.total}` : `${r.set}`;
  return [
    `${where}: ${unnamed.length} survivor${unnamed.length === 1 ? '' : 's'} not named in docs/dev/mutants.json`,
    // A mutant whose text spans lines is said on one: one survivor, one line.
    ...unnamed.map((m) => `${m.file}:${m.line} ${m.operator}: ${one(m.from)} → ${one(m.to)}`),
  ];
}

const one = (text: string) => text.replace(/\s*\n\s*/g, ' ');

/** The workflow command that writes the annotation (`::error title=…::`, its newlines escaped as GitHub reads them). */
export function verdictCommand(lines: readonly string[]): string {
  const [head, ...rest] = lines;
  const kept =
    rest.length > VERDICT_MAX
      ? [...rest.slice(0, VERDICT_MAX), `… and ${rest.length - VERDICT_MAX} more in the job's log`]
      : rest;
  const data = [head, ...kept].join('\n').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::error title=${VERDICT_TITLE}::${data}`;
}

/** A job's verdict from its annotations (`gh api repos/<repo>/check-runs/<job id>/annotations`), or undefined. */
export function readVerdict(annotations: unknown): string[] | undefined {
  if (!Array.isArray(annotations)) return undefined;
  const a = annotations.find(
    (x: { title?: unknown; annotation_level?: unknown; message?: unknown }) =>
      x?.title === VERDICT_TITLE && x.annotation_level === 'failure' && typeof x.message === 'string',
  ) as { message: string } | undefined;
  if (!a) return undefined;
  const lines = a.message.split('\n').filter((l) => l.trim());
  return lines.length ? lines : undefined;
}

// `npx tsx tools/release/mutation-verdict.ts --report=<shard report> --sha=<commit>`: candidate.yml's step after a
// failed mutation step. Prints the annotation when there is a verdict, a plain line when there is none; exits 0 either
// way (the job is red already, this step only says why).
// No top-level await: the release command imports this file for `readVerdict`, and must load in either module format.
async function main() {
  const { checkKnown, sameMutant } = await import('../mutate');
  const { ROOT } = await import('../game');
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const file = arg('report');
  const known = JSON.parse(readFileSync(resolve(ROOT, 'docs/dev/mutants.json'), 'utf8'));
  const version = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version as string;
  let report: unknown;
  try {
    report =
      file && existsSync(resolve(ROOT, file)) ? JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) : undefined;
  } catch {
    report = undefined;
  }
  const sha = arg('sha');
  const lines = shardVerdict({
    report,
    known,
    incomplete: checkKnown(known, version),
    ...(sha ? { sha } : {}),
    same: (a, b) => sameMutant(a, b as Parameters<typeof sameMutant>[1]),
  });
  console.log(
    lines
      ? verdictCommand(lines)
      : `no mutation verdict (no failed report of this commit): the job failed otherwise, and the release command re-runs it`,
  );
}
if (process.argv[1]?.endsWith('mutation-verdict.ts')) void main();
