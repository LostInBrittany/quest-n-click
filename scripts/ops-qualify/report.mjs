// The qualification's report (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): format
// web-scumm-ops-qualify, schema 1 — the version, the commit, the images, the Bridge image's identities, each step and
// what it measured — written whatever ended the run, and the run's exit code.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function newReport(c) {
  const { ROOT, version, sh, images, from, image, steps } = c;
  const report = {
    format: 'web-scumm-ops-qualify',
    schema: 1,
    version,
    commit: '',
    images: [...images, ...from],
    image,
    steps,
  };
  report.commit = sh('git', ['rev-parse', 'HEAD'], { cwd: ROOT, allowFail: true }).stdout.trim();
  return report;
}

export const writeReport = (out, report) =>
  writeFileSync(join(out, 'ops-qualify.json'), `${JSON.stringify(report, null, 1)}\n`);

/** The summary line, and the exit code: 1 when a step failed or the run stopped short. */
export function verdict(out, steps, failedHard) {
  const bad = steps.filter((s) => !s.ok);
  console.log(
    `\n${bad.length ? '✖' : '✔'}  ops:qualify: ${steps.length - bad.length}/${steps.length} steps; report ${join(out, 'ops-qualify.json')}`,
  );
  return bad.length || failedHard ? 1 : 0;
}
