// npm run wiki -- check | stats [--json] | build --target wiki --out <dir> [--preview] [--product-version <v>]
// [--doc-revision <sha>] [--product-commit <sha>] (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §5, phase A2; ADR 0030).
// The documentation's source is `wiki/` (a manifest, then `wiki/<lang>/<id>.md`); every output is generated from it.
// `check` is the work level of every pull request: it fails on errors only, and prints the warnings and what is still
// to write. `stats` counts the pages by state, domain, type and language: the workload estimate. `build --target
// wiki` writes the folder a publication pushes to the GitHub wiki; it publishes the `ready` pages, and the `draft`
// ones too with `--preview`. The other commands of §5 (`check --publish`, `coverage`, `bundle`, `publish`…) come with
// their phases. `--wiki=<dir>` reads another source folder (the tests' fixtures).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './game';
import { buildWiki } from './wiki/build';
import { checkWiki, trackedFiles, wikiStats } from './wiki/check';
import { readManifest } from './wiki/manifest';

/** `--name value` or `--name=value`. */
function option(args: readonly string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = args[i]!;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1];
}

const head = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

function main(args: readonly string[]): number {
  const [command] = args;
  const wikiDir = resolve(option(args, 'wiki') ?? resolve(ROOT, 'wiki'));
  if (command === 'check') {
    const r = checkWiki({ wikiDir, tracked: trackedFiles() });
    for (const e of r.errors) console.error(`✖  ${e}`);
    for (const w of r.warnings) console.warn(`⚠  ${w}`);
    for (const g of r.gaps) console.log(`·  ${g}`);
    const n = r.manifest?.pages.length ?? 0;
    if (r.errors.length) {
      console.error(`✖  wiki: ${r.errors.length} error(s), ${r.warnings.length} warning(s) over ${n} pages`);
      return 1;
    }
    console.log(
      `✔  wiki: ${n} pages consistent, ${r.warnings.length} warning(s), ${r.plannedLinks.length} link(s) to planned pages`,
    );
    return 0;
  }
  if (command === 'stats') {
    const { manifest, errors } = readManifest(wikiDir);
    if (!manifest) {
      for (const e of errors) console.error(`✖  ${e}`);
      return 1;
    }
    const s = wikiStats(manifest, wikiDir);
    if (args.includes('--json')) console.log(JSON.stringify(s));
    else {
      const line = (name: string, counts: Record<string, number>) =>
        console.log(
          `${name.padEnd(10)} ${Object.entries(counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}`,
        );
      console.log(`pages      ${s.total}`);
      line('state', s.byState);
      line('domain', s.byDomain);
      line('type', s.byType);
      line('files', s.byLanguage);
    }
    return 0;
  }
  if (command === 'build') {
    const target = option(args, 'target') ?? 'wiki';
    const out = option(args, 'out');
    if (target !== 'wiki' || !out) {
      console.error(
        'usage: npm run wiki -- build --target wiki --out <dir> [--preview] (html and bundle come in A4–A5)',
      );
      return 2;
    }
    const r = checkWiki({ wikiDir, tracked: trackedFiles() });
    if (!r.manifest || r.errors.length) {
      for (const e of r.errors) console.error(`✖  ${e}`);
      console.error('✖  the sources do not pass `npm run wiki -- check`: nothing built');
      return 1;
    }
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };
    const docRevision = option(args, 'doc-revision') ?? head();
    let files: string[];
    try {
      files = buildWiki({
        wikiDir,
        outDir: resolve(out),
        manifest: r.manifest,
        preview: args.includes('--preview'),
        productVersion: option(args, 'product-version') ?? pkg.version,
        docRevision,
        productCommit: option(args, 'product-commit') ?? docRevision,
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    console.log(
      `✔  ${files.length} file(s) written to ${resolve(out)}${args.includes('--preview') ? ' (preview: drafts included)' : ''}`,
    );
    return 0;
  }
  console.error(
    'usage: npm run wiki -- check | stats [--json] | build --target wiki --out <dir> [--preview] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>]',
  );
  return 2;
}

if (process.argv[1]?.endsWith('wiki.ts')) process.exit(main(process.argv.slice(2)));
