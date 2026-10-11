// What the scripts that install the archives outside the repository share (4.1.19, plan §8.4, split from
// scripts/external-consumer.mjs): portable processes (npm and npx through the shell on Windows, arguments quoted),
// unpacking with the system's own tar, servers left running and stopped by their PID, a URL awaited. Every command is
// a step with an id and its duration; a failure names the first step that failed and the command that reproduces it.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const WIN = process.platform === 'win32';
// Windows' own tar (bsdtar): Git's GNU tar, first on a bash PATH, reads `D:\…` as a remote host.
const TAR = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

/** Through the shell (npm and npx on Windows), an argument with a space is quoted, or cmd.exe splits it. */
const quoted = (shell, a) => (shell ? a.map((x) => (/[\s"]/.test(x) ? `"${x.replaceAll('"', '\\"')}"` : x)) : a);

/** The harness of one script: its environment, its base folder, its steps. */
export function harness({ env = process.env, base }) {
  let n = 0;
  const steps = [];
  /** One command in `cwd`, its output shown; throws on a non-zero exit, saying the step and how to run it again. */
  function run(title, cmd, a, cwd, o = {}) {
    const id = `s${String(++n).padStart(2, '0')}`;
    console.log(`\n▶ [${id}] ${title}`);
    const shell = WIN && (cmd === 'npm' || cmd === 'npx');
    const t0 = Date.now();
    const r = spawnSync(shell ? `${cmd}.cmd` : cmd, quoted(shell, a), {
      cwd,
      stdio: o.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      encoding: 'utf8',
      env: { ...env, ...(o.env ?? {}) },
      shell,
    });
    const ms = Date.now() - t0;
    steps.push({ id, title, ms, status: r.status });
    console.log(`  [${id}] ${ms} ms`);
    if (r.status !== 0)
      throw new Error(
        `step ${id} "${title}": exit ${r.status}${r.error ? ` (${r.error.message})` : ''}; to run it again: (cd ${JSON.stringify(cwd)} && ${[cmd, ...a].map((x) => (/[\s"]/.test(x) ? JSON.stringify(x) : x)).join(' ')})`,
      );
    return r.stdout ?? '';
  }
  /** A tarball unpacked into `into` (its `package/` folder renamed): `tar` is on Linux, macOS and Windows 10+. */
  function unpack(tgz, into) {
    const tmp = mkdtempSync(join(base, 'unpack-'));
    run(`unpack ${tgz.split(/[\\/]/).pop()}`, TAR, ['-xzf', tgz, '-C', tmp], base);
    renameSync(join(tmp, 'package'), into);
    rmSync(tmp, { recursive: true, force: true });
    return into;
  }
  /**
   * A process left running (a server). `exited` says when it stopped (one that dies at once, a port taken, is seen);
   * `stop()` ends it, the whole tree on Windows, and waits for its exit (a SIGKILL after five seconds).
   */
  function serve(cmd, a, cwd, o = {}) {
    const shell = WIN && (cmd === 'npm' || cmd === 'npx');
    const p = spawn(shell ? `${cmd}.cmd` : cmd, quoted(shell, a), { cwd, env: env, stdio: o.stdio ?? 'ignore', shell });
    let exited = null;
    const gone = new Promise((ok) => p.on('exit', (code, signal) => ok((exited = { code, signal }))));
    return {
      process: p,
      get exited() {
        return exited;
      },
      async stop() {
        if (!p.pid || exited) return;
        if (WIN) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
        else p.kill('SIGTERM');
        const kill = setTimeout(() => p.kill('SIGKILL'), 5000);
        await gone;
        clearTimeout(kill);
      },
    };
  }
  return { run, unpack, serve, steps };
}

/** A URL awaited until `test` holds (80 tries, half a second apart). */
export async function waitFor(url, test = (r) => r.ok, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (await test(r)) return r;
    } catch {
      /* not up yet */
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`${url} never answered`);
}
