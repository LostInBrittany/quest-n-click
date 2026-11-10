// What the scripts that install the archives outside the repository share (4.1.19, plan §8.4, split from
// scripts/external-consumer.mjs): portable processes (npm and npx through the shell on Windows, arguments quoted),
// unpacking with the system's own tar, servers left running and stopped by their PID, a URL awaited. Every command is
// a step with an id and its duration; a failure names the first step that failed and the command that reproduces it.
// (#471) An `npm install` without a lockfile is tried again on a registry hiccup (`npmInstall`), here for every script
// that installs outside the repository, through `run` or on its own.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const WIN = process.platform === 'win32';
// Windows' own tar (bsdtar): Git's GNU tar, first on a bash PATH, reads `D:\…` as a remote host.
const TAR = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

/** Through the shell (npm and npx on Windows), an argument with a space is quoted, or cmd.exe splits it. */
const quoted = (shell, a) => (shell ? a.map((x) => (/[\s"]/.test(x) ? `"${x.replaceAll('"', '\\"')}"` : x)) : a);

/**
 * Why a failed `npm install` may pass a little later, from its stderr, or null (#471): a tarball the registry's index
 * lists but its CDN does not serve yet (run 42633058102: `404 Not Found - GET …/rollup-4.68.2.tgz`, published a minute
 * before), a version not in a stale index yet (ETARGET), the network, a 5xx or a 429. A 404 on a package's index (a
 * name that does not exist), a peer conflict or a failed build script is this tree's own fault: null.
 */
export function transientNpm(stderr) {
  const tgz = /^npm (?:error|ERR!) 404 .*\/-\/\S+\.tgz/m.exec(stderr);
  if (tgz) return `E404 on a tarball the registry's index already lists (${tgz[0].split(' GET ').pop()})`;
  const code = /^npm (?:error|ERR!) code (ETARGET|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN|E429|E5\d\d)$/m.exec(
    stderr,
  );
  return code ? code[1] : null;
}

/** The pauses before the second, third and fourth tries: 30, 60, 120 s (a CDN a few minutes behind its index). */
export const NPM_WAITS = [30_000, 60_000, 120_000];
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * `once(i)` (the i-th try, from 0, giving `{ status, stderr }`) again while it fails on a transient registry error
 * (`transientNpm`) or was killed by its own time limit (spawnSync's `ETIMEDOUT`, #539), after each of `waits`; each new
 * try said with its reason (`tell`, stderr). The last result comes back, whatever it is: the caller fails on it with
 * npm's own output, already shown.
 */
export function retryNpm(once, { waits = NPM_WAITS, tell = (l) => console.error(`  ⚠  ${l}`), wait = sleep } = {}) {
  for (let i = 0; ; i++) {
    const r = once(i);
    const why =
      r.status === 0 ? null : r.error?.code === 'ETIMEDOUT' ? "the try's time limit" : transientNpm(r.stderr ?? '');
    if (!why || i >= waits.length) return r;
    tell(`npm install failed on ${why}, try ${i + 1}/${waits.length + 1}: again in ${waits[i] / 1000} s`);
    wait(waits[i]);
  }
}

/**
 * `npm <args>` (an install) in `cwd`, through `retryNpm`: stdout shown (or captured: `capture`), stderr read for the
 * error's code and shown after each try. A try after the first adds `--prefer-online`, so that npm asks the registry
 * again rather than its cache. `timeout` (ms) bounds each try, unbounded by default (#539): a try that stalls is killed
 * with SIGTERM, as coreutils' `timeout` does, and tried again. Gives spawnSync's result; `npmInstall` throws on a
 * failure in the end.
 */
function npmRun(args, { cwd, env = process.env, capture = false, timeout, ...retry } = {}) {
  return retryNpm((i) => {
    const a = i === 0 ? args : [...args, '--prefer-online'];
    const r = spawnSync(WIN ? 'npm.cmd' : 'npm', quoted(WIN, a), {
      cwd,
      env,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      shell: WIN,
      timeout,
      killSignal: 'SIGTERM',
    });
    if (r.stderr) process.stderr.write(r.stderr);
    return r;
  }, retry);
}

/** `npm <args>` through `npmRun`, its stdout given back; throws on a non-zero exit in the end. */
export function npmInstall(args, o = {}) {
  const r = npmRun(args, o);
  if (r.status !== 0)
    throw new Error(`npm ${args.join(' ')} in ${o.cwd}: exit ${r.status}${r.error ? ` (${r.error.message})` : ''}`);
  return r.stdout ?? '';
}

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
    const r =
      cmd === 'npm' && a[0] === 'install'
        ? npmRun(a, { cwd, env: { ...env, ...(o.env ?? {}) }, capture: o.capture })
        : spawnSync(shell ? `${cmd}.cmd` : cmd, quoted(shell, a), {
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
