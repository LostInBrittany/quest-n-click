// scripts/ci-ffmpeg.sh's apt fallback (4.5.6, #374), run when the static build cannot be fetched. `timeout` above sudo
// killed sudo, not the apt-get under it, which went on holding the dpkg lock (#353), and its four minutes also covered
// dpkg. Only the download is bounded now, by a `timeout` that sudo runs (apt-get's own parent); the install, from apt's
// cache, is not, and waits for a lock still held.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/ci-ffmpeg.sh';

describe('scripts/ci-ffmpeg.sh, its apt fallback', () => {
  it('bounds the download only, `timeout` under sudo, never the install (#374)', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    const bounded = script.split('\n').filter((line) => /^\s*[^#\s][^#]*\btimeout\b/.test(line));
    expect(bounded.length).toBe(2);
    for (const line of bounded) {
      expect(line).not.toMatch(/\btimeout \S+ \$SUDO\b|\btimeout \S+ sudo\b/);
      expect(line).toMatch(/\$SUDO timeout -k \d+ \d+ "\$\{apt\[@\]\}" (update|install --download-only)\b/);
    }
    expect(script).toMatch(/^\s+&& \$SUDO "\$\{apt\[@\]\}" install -y -qq ffmpeg; then/m);
    expect(script).toMatch(/DPkg::Lock::Timeout=\d+/);
    execFileSync('bash', ['-n', SCRIPT]);
  });
});

// The script run for real, with only stand-ins on its PATH: curl fails (no static build), sudo, timeout and apt-get
// log their arguments, and the install leaves an `ffmpeg`.
describe.skipIf(process.platform === 'win32')('scripts/ci-ffmpeg.sh when the static build fails (#374)', () => {
  const STUBS: Record<string, string> = {
    id: 'echo 1001',
    curl: 'exit 22',
    sudo: 'echo "sudo $*" >> "$LOG"; exec "$@"',
    timeout: 'echo "timeout $*" >> "$LOG"; shift 3; exec "$@"',
    sleep: 'echo "sleep $*" >> "$LOG"',
    'apt-get': [
      'echo "apt-get $*" >> "$LOG"',
      'case "$*" in',
      '  *--download-only*) n=$(cat "$DIR/downloads" 2>/dev/null || echo 0); echo $((n + 1)) > "$DIR/downloads"',
      '    [ "$n" -ge "${DOWNLOAD_FAILS:-0}" ] || exit 124 ;;',
      '  *" install "*) printf \'#!/bin/bash\\necho "ffmpeg version stub"\\n\' > "$DIR/bin/ffmpeg"; chmod +x "$DIR/bin/ffmpeg" ;;',
      'esac',
    ].join('\n'),
  };
  const dirs: string[] = [];

  function run(env: Record<string, string>): { code: number; out: string; log: string[] } {
    const dir = mkdtempSync(join(tmpdir(), 'ci-ffmpeg-'));
    dirs.push(dir);
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const [name, body] of Object.entries(STUBS)) {
      writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    // The few real tools the script needs; nothing else, so a real ffmpeg on this machine is not found.
    for (const tool of ['mktemp', 'head', 'cat', 'chmod', 'printf'])
      symlinkSync(execFileSync('bash', ['-c', `type -P ${tool}`], { encoding: 'utf8' }).trim(), join(bin, tool));
    let code = 0;
    let out = '';
    try {
      out = execFileSync('/bin/bash', [resolve(SCRIPT)], {
        env: { ...env, PATH: bin, LOG: join(dir, 'log'), DIR: dir },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    return { code, out, log: readFileSync(join(dir, 'log'), 'utf8').trim().split('\n') };
  }

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('downloads under `timeout`, run by sudo, then installs with nothing bounded', () => {
    const { code, out, log } = run({});
    expect(code).toBe(0);
    expect(out).toContain('ffmpeg version stub');
    const lock = '-o DPkg::Lock::Timeout=300';
    expect(log).toEqual([
      `sudo timeout -k 10 240 apt-get ${lock} update -qq`,
      `timeout -k 10 240 apt-get ${lock} update -qq`,
      `apt-get ${lock} update -qq`,
      `sudo timeout -k 10 240 apt-get ${lock} install --download-only -y -qq ffmpeg`,
      `timeout -k 10 240 apt-get ${lock} install --download-only -y -qq ffmpeg`,
      `apt-get ${lock} install --download-only -y -qq ffmpeg`,
      `sudo apt-get ${lock} install -y -qq ffmpeg`,
      `apt-get ${lock} install -y -qq ffmpeg`,
    ]);
  });

  it('tries the download again after a pause when it runs out of time', () => {
    const { code, log } = run({ DOWNLOAD_FAILS: '1' });
    expect(code).toBe(0);
    expect(log.filter((l) => l.startsWith('apt-get') && l.includes('--download-only')).length).toBe(2);
    expect(log).toContain('sleep 10');
    expect(log.filter((l) => /^apt-get .* install -y/.test(l)).length).toBe(1);
  });

  it('fails after two attempts, never installing what was not downloaded', () => {
    const { code, log } = run({ DOWNLOAD_FAILS: '9' });
    expect(code).toBe(1);
    expect(log.filter((l) => l.startsWith('apt-get') && l.includes('--download-only')).length).toBe(2);
    expect(log.some((l) => /^apt-get .* install -y/.test(l))).toBe(false);
  });
});
