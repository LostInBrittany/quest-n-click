// The install steps' retry loops (4.5.5, #340): `for i in 1 2 3; do (…) && break; …; sleep 15; done`. One
// `timeout-minutes` on the step alone let an attempt that stalls (apt at a few kB/s under `playwright install
// --with-deps`, #338) spend the whole step, and the second and third attempts never ran. Each attempt has its own
// `timeout <n>m`, and the step leaves room for the three and the two pauses. macOS has no `timeout`, and on Windows
// System32's timeout.exe may come first in the PATH: the jobs that run there keep their loops unbounded, said in a
// comment, and are listed here so that a new one is a decision.
// No workflow loop runs apt under `timeout` (#353): `timeout` killed `npx playwright install --with-deps`, not the
// apt-get it ran through sudo, which went on holding the dpkg lock, and the two retries failed at once. Playwright's
// system packages go through scripts/ci-playwright-deps.sh; the browsers' download, no apt in it, keeps its limit an
// attempt. In the script (#373), only the download is bounded, `timeout` being apt-get's own parent under sudo, and a
// retry puts the runner's first apt mirror last: a mirror at 40 kB/s had spent the step on one attempt.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

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

  it('run no apt under `timeout`: a killed attempt left apt-get holding the dpkg lock (#353)', () => {
    for (const l of found) expect(l.body, l.where).not.toMatch(/--with-deps|install-deps|apt-get|\bapt\b|\bsudo\b/);
  });

  it("install Playwright's system packages through scripts/ci-playwright-deps.sh, for the browsers the job downloads", () => {
    const { jobs } = loops();
    const onRunner = found.filter((l) => /npx playwright install /.test(l.body) && /^ubuntu-/.test(l.runsOn));
    expect([...new Set(onRunner.map((l) => l.where))].sort()).toEqual([
      'candidate.yml cross-runtime',
      'candidate.yml release-core',
      'ci.yml studio-hosted',
      'nightly.yml cross-runtime',
    ]);
    for (const l of onRunner) {
      const browsers = /npx playwright install ([\w ]+)\)$/.exec(l.body)![1]!;
      const job = jobs.get(l.where)!;
      const deps = new RegExp(
        `\\n( +)(?:- )?run: bash scripts/ci-playwright-deps\\.sh ${browsers}\\n\\1(?:  )?timeout-minutes: (\\d+)`,
      );
      const m = deps.exec(job);
      expect(m, `${l.where}: no scripts/ci-playwright-deps.sh ${browsers} step with a timeout-minutes`).not.toBeNull();
      expect(job.indexOf('ci-playwright-deps.sh'), l.where).toBeLessThan(job.indexOf(l.body));
    }
  });

  it('let apt fail by itself on a stalled mirror and wait for its lock, and bound the download only (#373)', () => {
    const script = readFileSync('scripts/ci-playwright-deps.sh', 'utf8');
    for (const option of [
      'Acquire::http::Timeout',
      'Acquire::https::Timeout',
      'Acquire::Retries',
      'DPkg::Lock::Timeout',
    ])
      expect(script, option).toMatch(new RegExp(`'${option} "\\d+";'`));
    expect(script).toMatch(/^APT_ETC=\$\{CI_APT_ETC:-\/etc\/apt\}$/m);
    expect(script).toMatch(/tee "\$APT_ETC\/apt\.conf\.d\/[\w-]+"/);
    // `timeout` only ever runs apt-get's update or its download, as apt-get's own parent (under sudo, never above it):
    // killed there, apt-get releases its locks and dpkg has not started.
    const bounded = script.split('\n').filter((line) => /^\s*[^#\s][^#]*\btimeout\b/.test(line));
    expect(bounded.length).toBe(2);
    for (const line of bounded)
      expect(line).toMatch(
        /^\s*\$SUDO timeout -k \d+ \d+m apt-get (update|install --download-only -y --no-install-recommends \$missing)\b/,
      );
    // The install itself, dpkg included, is never under `timeout`.
    expect(script).toMatch(/^\s+npx playwright install-deps "\$@" && exit 0$/m);
    execFileSync('bash', ['-n', 'scripts/ci-playwright-deps.sh']);
  });
});

// The script run for real against stand-ins for sudo, id, sleep, timeout, npx and apt-get, which log their arguments.
describe.skipIf(process.platform === 'win32')('scripts/ci-playwright-deps.sh on a runner (#373)', () => {
  const MIRRORS =
    'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n' +
    'https://archive.ubuntu.com/ubuntu/\tpriority:2\n' +
    'https://security.ubuntu.com/ubuntu/\tpriority:3\n';
  const STUBS: Record<string, string> = {
    sudo: 'echo "sudo $*" >> "$LOG"; exec "$@"',
    id: 'echo 1001',
    sleep: 'echo "sleep $*" >> "$LOG"',
    timeout: 'echo "timeout $*" >> "$LOG"; shift 3; exec "$@"',
    npx: [
      'case "$*" in',
      '  *--dry-run*) [ -n "${MISSING:-}" ] || { echo "All system dependencies are installed."; exit 0; }',
      '    echo "Missing system dependencies (2):"; for p in $MISSING; do echo "  $p"; done; exit 1 ;;',
      '  *) echo "npx $*" >> "$LOG"; n=$(cat "$DIR/installs" 2>/dev/null || echo 0); echo $((n + 1)) > "$DIR/installs"',
      '    [ "$n" -ge "${INSTALL_FAILS:-0}" ] ;;',
      'esac',
    ].join('\n'),
    'apt-get': [
      'echo "apt-get $*" >> "$LOG"',
      'case "$1" in install)',
      '  n=$(cat "$DIR/downloads" 2>/dev/null || echo 0); echo $((n + 1)) > "$DIR/downloads"',
      '  [ "$n" -ge "${DOWNLOAD_FAILS:-0}" ] || exit 124',
      '  grep -q "^http://azure.*priority:1$" "$CI_APT_ETC/apt-mirrors.txt" && echo "azure first" >> "$LOG" || true ;;',
      'esac',
    ].join('\n'),
  };
  const dirs: string[] = [];

  function run(env: Record<string, string>, mirrors = true): { code: number; log: string[]; mirrors?: string } {
    const dir = mkdtempSync(join(tmpdir(), 'ci-playwright-deps-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'apt', 'apt.conf.d'), { recursive: true });
    for (const [name, body] of Object.entries(STUBS)) {
      writeFileSync(join(dir, 'bin', name), `#!/usr/bin/env bash\n${body}\n`);
      chmodSync(join(dir, 'bin', name), 0o755);
    }
    if (mirrors) writeFileSync(join(dir, 'apt', 'apt-mirrors.txt'), MIRRORS);
    let code = 0;
    try {
      execFileSync('bash', [resolve('scripts/ci-playwright-deps.sh'), 'chromium', 'firefox'], {
        env: {
          ...env,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          LOG: join(dir, 'log'),
          DIR: dir,
          CI_APT_ETC: join(dir, 'apt'),
        },
        stdio: 'pipe',
      });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    const log = readFileSync(join(dir, 'log'), 'utf8').trim().split('\n');
    const list = mirrors ? readFileSync(join(dir, 'apt', 'apt-mirrors.txt'), 'utf8') : undefined;
    return { code, log, mirrors: list };
  }

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('downloads what Playwright reports missing under `timeout`, then installs with nothing bounded', () => {
    const { code, log, mirrors } = run({ MISSING: 'libfoo1 libbar2' });
    expect(code).toBe(0);
    expect(log.filter((l) => !l.startsWith('sudo '))).toEqual([
      'timeout -k 10 2m apt-get update',
      'apt-get update',
      'timeout -k 10 3m apt-get install --download-only -y --no-install-recommends libfoo1 libbar2',
      'apt-get install --download-only -y --no-install-recommends libfoo1 libbar2',
      'azure first',
      'npx playwright install-deps chromium firefox',
    ]);
    // sudo runs `timeout`, not the reverse: `timeout` is apt-get's parent and kills apt-get itself.
    expect(log).toContain('sudo timeout -k 10 2m apt-get update');
    expect(mirrors).toBe(MIRRORS);
    expect(readFileSync(join(dirs.at(-1)!, 'apt', 'apt.conf.d', '90-ci-playwright-deps'), 'utf8')).toContain(
      'Acquire::http::Timeout "60";',
    );
  });

  it('puts the first mirror last when a download runs out of time, and goes on from there', () => {
    const { code, log, mirrors } = run({ MISSING: 'libfoo1 libbar2', DOWNLOAD_FAILS: '1' });
    expect(code).toBe(0);
    expect(mirrors).toBe(
      'http://azure.archive.ubuntu.com/ubuntu/\tpriority:9\n' +
        'https://archive.ubuntu.com/ubuntu/\tpriority:2\n' +
        'https://security.ubuntu.com/ubuntu/\tpriority:3\n',
    );
    expect(log.filter((l) => l.startsWith('apt-get install')).length).toBe(2);
    expect(log.filter((l) => l.startsWith('npx '))).toEqual(['npx playwright install-deps chromium firefox']);
    expect(log).toContain('sleep 15');
    expect(log).not.toContain('azure first');
  });

  it('skips the download when nothing is missing, and needs no mirror list (a container)', () => {
    const { code, log } = run({}, false);
    expect(code).toBe(0);
    expect(log.some((l) => l.startsWith('apt-get install'))).toBe(false);
    expect(log.filter((l) => l.startsWith('npx '))).toEqual(['npx playwright install-deps chromium firefox']);
  });

  it('fails after three attempts, the mirror list demoted once', () => {
    const { code, log, mirrors } = run({ MISSING: 'libfoo1', INSTALL_FAILS: '9' });
    expect(code).toBe(1);
    expect(log.filter((l) => l.startsWith('npx ')).length).toBe(3);
    expect(log.filter((l) => l === 'sleep 15').length).toBe(2);
    expect(mirrors!.match(/priority:9/g)!.length).toBe(1);
  });
});
