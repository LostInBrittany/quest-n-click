// The docs' human gates, as the release pull request's CI checks them (4.5.5): shared by `prepare` and `check`
// (tools/release/prepare.ts) and by the release command (tools/release/release-run.ts), which judges them on the release
// commit's own tree. Its own module (#348): release-run.ts importing it from prepare.ts was a cycle with prepare's
// top-level `await import('./release-run')`, and `npm run release -- <version>` exited at once, its await unsettled.

/** Runs a command: its exit code and what it printed. */
export type Run = (cmd: string, args: string[]) => { code: number; out: string };

/**
 * The docs' human gates, as the release pull request's CI checks them (`wiki -- check --publish --reviews-only`): what
 * docs-publish would refuse but "executed". What to do is the wiki's own ✖ lines (each claim or pair, with the command).
 */
export function humanGates(run: Run) {
  const r = run('npm', [
    'run',
    '-s',
    'wiki',
    '--',
    'check',
    '--publish',
    '--product-ref',
    'HEAD',
    '--doc-ref',
    'HEAD',
    '--state',
    'candidate',
    '--reviews-only',
  ]);
  return {
    ok: r.code === 0,
    detail: r.out
      .split('\n')
      .filter((l) => l.startsWith('✖'))
      .join('\n'),
  };
}
