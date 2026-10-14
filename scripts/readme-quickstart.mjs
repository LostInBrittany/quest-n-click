#!/usr/bin/env node
// npm run readme-quickstart -- --tarballs=<dir> | --published (4.1.19, docs/dev/PLAN-4.1.19-FIELD-CLOSURE.md §11.1): the
// README's quick start, as a reader copies it. The block under "## Start" is read from README.md; its `T=` line must
// name this version's archive on GitHub, then points at the candidate's own archive (`file:` in --tarballs: the URL does
// not exist before the tag); every other line runs as written, in bash, in an empty folder outside the repository. A
// development server never ends, so `npm run dev` runs until it answers, then stops; the commands its comment names
// (`npm run verify`, `npm run build`) run after it. `--published`, after the tag: the README's URL answers, and its
// bytes are the SHA-256 the release's SHA256SUMS lists.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchRetry } from '../tools/release/fetch-retry.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** The quick start of a README: the lines of the first bash block after "## Start", and the archive URL it sets. */
export function quickStart(readme) {
  const start = readme.indexOf('\n## Start');
  if (start < 0) throw new Error('README.md has no "## Start" section');
  const block = readme.slice(start).match(/```bash\n([\s\S]*?)```/);
  if (!block) throw new Error('the "## Start" section has no bash block');
  const lines = block[1].trimEnd().split('\n');
  const t = lines.find((l) => l.startsWith('T='));
  if (!t) throw new Error('the quick start sets no T= archive');
  return { lines, url: t.slice(2).trim() };
}

/** The URL the README must name for `version`. */
export const archiveUrl = (version) =>
  `https://github.com/wanoo/web-scumm/releases/download/v${version}/web-scumm-${version}.tgz`;

/** The bash script that plays the quick start against `archive`: T replaced, `npm run dev` until it answers, then the
 * commands named in its comment. */
export function script(lines, archive, port) {
  const out = ['set -euo pipefail'];
  const after = [];
  for (const line of lines) {
    if (line.startsWith('T=')) {
      out.push(`T=${JSON.stringify(`file:${archive}`)}`);
      continue;
    }
    const [code, comment = ''] = line.split(/\s+#\s/);
    if (/\bnpm run dev\b/.test(code)) {
      const before = code.split(/\s*&&\s*npm run dev\b/)[0];
      if (before !== code) out.push(before);
      out.push(
        `npm run dev -- --port ${port} --strictPort > dev.log 2>&1 & for i in $(seq 1 120); do curl -fsS http://127.0.0.1:${port}/ >/dev/null 2>&1 && break; sleep 1; [ "$i" = 120 ] && { cat dev.log; exit 1; }; done; echo "npm run dev: answered on ${port}"`,
      );
      after.push(...[...comment.matchAll(/npm run [\w:-]+/g)].map((m) => m[0]));
      continue;
    }
    out.push(code);
  }
  return [...out, ...after].join('\n');
}

async function published(version) {
  const url = archiveUrl(version);
  const sumsUrl = `https://github.com/wanoo/web-scumm/releases/download/v${version}/web-scumm-v${version}-SHA256SUMS`;
  const [tgz, sums] = await Promise.all([fetchRetry(url), fetchRetry(sumsUrl)]);
  if (!tgz.ok || !sums.ok) throw new Error(`${url}: ${tgz.status}; ${sumsUrl}: ${sums.status}`);
  const got = createHash('sha256')
    .update(Buffer.from(await tgz.arrayBuffer()))
    .digest('hex');
  const want = (await sums.text())
    .split('\n')
    .find((l) => l.endsWith(` web-scumm-${version}.tgz`))
    ?.split(/\s+/)[0];
  if (got !== want) throw new Error(`${url}: SHA-256 ${got}, the release lists ${want ?? 'nothing'}`);
  console.log(`✔  readme-quickstart --published: ${url} answers, SHA-256 ${got} as SHA256SUMS lists it`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const { lines, url } = quickStart(readFileSync(join(ROOT, 'README.md'), 'utf8'));
  if (url !== archiveUrl(version)) {
    console.error(`✖  README.md's quick start names ${url}, not ${archiveUrl(version)}`);
    process.exit(1);
  }
  if (args.includes('--published')) {
    await published(version);
    process.exit(0);
  }
  const dir = args.find((a) => a.startsWith('--tarballs='))?.slice(11);
  const archive = dir && resolve(dir, `web-scumm-${version}.tgz`);
  if (!archive || !existsSync(archive)) {
    console.error(`usage: readme-quickstart --tarballs=<dir holding web-scumm-${version}.tgz> | --published`);
    process.exit(2);
  }
  const base = mkdtempSync(join(tmpdir(), 'readme-quickstart-'));
  const file = join(base, 'quickstart.sh');
  writeFileSync(file, script(lines, archive, 4419));
  console.log(readFileSync(file, 'utf8'));
  // In a process group of its own: the development server outlives the script, and the group, this run's alone, is
  // stopped by its id.
  const child = spawn('bash', [file], {
    cwd: base,
    stdio: 'inherit',
    detached: true,
  });
  const r = {
    status: await new Promise((ok) => child.on('exit', (code) => ok(code))),
  };
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
  console.log(
    r.status === 0
      ? '✔  readme-quickstart: the README quick start ran from the candidate archive'
      : '✖  readme-quickstart failed',
  );
  process.exit(r.status ?? 1);
}
