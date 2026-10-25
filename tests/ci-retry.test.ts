// The install steps' retry loops (4.5.5, #340): `for i in 1 2 3; do (…) && break; …; sleep 15; done`. One
// `timeout-minutes` on the step alone let an attempt that stalls (apt at a few kB/s under `playwright install
// --with-deps`, #338) spend the whole step, and the second and third attempts never ran. Each attempt has its own
// `timeout <n>m`, and the step leaves room for the three and the two pauses. macOS has no `timeout`, and on Windows
// System32's timeout.exe may come first in the PATH: the jobs that run there keep their loops unbounded, said in a
// comment, and are listed here so that a new one is a decision.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = '.github/workflows';
const LOOP = /for i in 1 2 3; do (.*?) && break; \[ "\$i" = 3 \] && exit 1; echo "retry \$i"; sleep 15; done/g;
/** The jobs that do not run on Linux alone, and so have no per-attempt limit. */
const UNBOUNDED = ['candidate.yml external-consumer', 'ci.yml external-consumer', 'ci.yml windows'];

type Loop = { where: string; body: string; step: number | undefined; runsOn: string; job: string };

/** Every retry loop of every workflow, with its step's `timeout-minutes` and its job's `runs-on`. */
function loops(): { found: Loop[]; jobs: Map<string, string> } {
  const found: Loop[] = [];
  const jobs = new Map<string, string>();
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith('.yml'))
    .sort()) {
    const text = readFileSync(`${DIR}/${file}`, 'utf8');
    const body = text.split('\njobs:\n')[1] ?? '';
    for (const job of body.split(/\n(?=  [\w-]+:\n)/)) {
      const name = /^  ([\w-]+):/.exec(job)?.[1];
      if (!name) continue;
      const key = `${file} ${name}`;
      jobs.set(key, job);
      const runsOn = /\n    runs-on: (.+)/.exec(job)?.[1] ?? '';
      for (const step of job.split(/\n(?=      - )/)) {
        const minutes = /\n        timeout-minutes: (\d+)/.exec(step)?.[1];
        for (const m of step.matchAll(LOOP))
          found.push({ where: key, body: m[1]!, step: minutes ? Number(minutes) : undefined, runsOn, job });
      }
    }
    // The parser misses none: as many loops found in the file as the file's text has.
    const all = [...text.matchAll(LOOP)].length;
    expect(found.filter((l) => l.where.startsWith(`${file} `)).length, file).toBe(all);
  }
  return { found, jobs };
}

describe('the retry loops of the workflows', () => {
  const { found } = loops();

  it('are found in every workflow that installs something', () => {
    expect(found.length).toBeGreaterThan(75);
    expect(new Set(found.map((l) => l.where.split(' ')[0]))).toEqual(
      new Set([
        'candidate.yml',
        'ci.yml',
        'docs-publish.yml',
        'mutation.yml',
        'nightly.yml',
        'prove.yml',
        'qualify.yml',
        'release.yml',
      ]),
    );
  });

  it('bound each attempt on Linux, inside a step that has room for the three and the two pauses', () => {
    for (const l of found.filter((x) => !UNBOUNDED.includes(x.where))) {
      expect(l.runsOn, `${l.where}: a loop off Linux must be listed in UNBOUNDED`).toMatch(/^ubuntu-/);
      const m = /^\(timeout (\d+)m [^()]+\)$/.exec(l.body);
      expect(m, `${l.where}: ${l.body}`).not.toBeNull();
      const n = Number(m![1]);
      expect(n, `${l.where}: ${l.body}`).toBeGreaterThanOrEqual(3);
      expect(l.step, `${l.where}: ${l.body} has no timeout-minutes`).toBeDefined();
      expect(3 * n + 1, `${l.where}: ${l.body} in a step of ${l.step} minutes`).toBeLessThanOrEqual(l.step!);
    }
  });

  it('leave the macOS and Windows jobs unbounded, a step limit kept and the reason said', () => {
    const off = found.filter((l) => UNBOUNDED.includes(l.where));
    expect([...new Set(off.map((l) => l.where))].sort()).toEqual(UNBOUNDED);
    for (const l of off) {
      expect(l.runsOn, l.where).not.toMatch(/^ubuntu-/);
      expect(l.body, l.where).not.toMatch(/timeout/);
      expect(l.body, l.where).toMatch(/^\([^()]+\)$/);
      expect(l.step, `${l.where}: ${l.body} has no timeout-minutes`).toBeDefined();
      expect(l.job, l.where).toMatch(
        /# .*\(4\.5\.5, #340\): macOS has no\n\s+# `timeout`, and on Windows System32's timeout\.exe/,
      );
    }
  });
});
