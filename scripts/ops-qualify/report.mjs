// The qualification's report (4.1.20 PR 3, plan §8.0–8.1, split from scripts/ops-qualify.mjs): format
// web-scumm-ops-qualify, written whatever ended the run, and the run's exit code. Schema 2 (4.1.20): the profile (full
// or short), the commit, the candidate run it qualifies (`--candidate-run=`), the SHA-256 of the four archives it
// installed, the images, the Bridge image's identities, the command that reproduces it, and each step with its id,
// duration and first defect.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** The four archives the run installed (`--tarballs=`, else the ones it packed), by name and SHA-256. */
export const archivesIn = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tgz'))
    .sort()
    .map((name) => ({ name, sha256: sha256(join(dir, name)) }));

export function newReport(c) {
  const { ROOT, args, flag, version, SHORT, sh, tarballs, images, from, image, steps } = c;
  const report = {
    format: 'web-scumm-ops-qualify',
    schema: 2,
    version,
    profile: SHORT ? 'short' : 'full',
    commit: '',
    candidateRun: flag('candidate-run') ?? null,
    archives: archivesIn(tarballs),
    images: [...images, ...from],
    image,
    reproduce:
      `npm run ops:qualify -- ${args.filter((a) => !a.startsWith('--out=') && !a.startsWith('--candidate-run=')).join(' ')}`.trim(),
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
