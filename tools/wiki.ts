// npm run wiki -- check | stats [--json] | coverage [--init [--force]] | build --target wiki --out <dir> [--preview]
// [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §5,
// phases A2 and A3; ADR 0030).
// The documentation's source is `wiki/` (a manifest, then `wiki/<lang>/<id>.md`); every output is generated from it.
// `check` is the work level of every pull request: it fails on errors only, and prints the warnings and what is still
// to write. `stats` counts the pages by state, domain, type and language: the workload estimate. `build --target
// wiki` writes the folder a publication pushes to the GitHub wiki; it publishes the `ready` pages, and the `draft`
// ones too with `--preview`. `coverage --init` takes the anchor inventory of the old documentation into
// `wiki/coverage.json`; `coverage` merges a new inventory into it, keeping what a person wrote, and regenerates
// `wiki/legacy.json` and the manifest's `replaces` (§4.2). The other commands of §5 (`check --publish`, `bundle`,
// `publish`…) come with their phases. `--wiki=<dir>` reads another source folder (the tests' fixtures). The output folder is outside the
// working tree (or under `.cache/`), so a build never lands among the sources, and only a previous build is emptied.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ROOT } from './game';
import { buildWiki } from './wiki/build';
import { checkWiki, trackedFiles, wikiStats } from './wiki/check';
import {
  checkCoverage,
  counterLines,
  coverageCounters,
  coveragePath,
  incomingLinks,
  initCoverage,
  inventory,
  mergeCoverage,
  readCoverage,
  unresolvedLinks,
  writeCoverage,
} from './wiki/coverage';
import { readManifest } from './wiki/manifest';

class UsageError extends Error {}

/** `--name value` or `--name=value`; a value missing, empty or starting with `--` is a usage error. */
function option(args: readonly string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = args[i]!;
  const value = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1];
  if (!value || value.startsWith('--')) throw new UsageError(`--${name} needs a value`);
  return value;
}

/** Why an output folder is refused: inside the working tree, except under `.cache/`. */
export function outProblem(out: string, root = ROOT): string | undefined {
  // Forward slashes on every system: Windows' relative() answers `.cache\wiki`.
  const rel = relative(root, resolve(out)).split(sep).join('/');
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (inside && rel !== '.cache' && !rel.startsWith('.cache/'))
    return `${out} is inside the repository's working tree: build outside it, or under .cache/`;
  return undefined;
}

const USAGE =
  'usage: npm run wiki -- check | stats [--json] | coverage [--init [--force]] | build --target wiki --out <dir> [--preview] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>]';

const head = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

export function main(args: readonly string[]): number {
  try {
    return run(args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`✖  ${e.message}\n${USAGE}`);
    return 2;
  }
}

function run(args: readonly string[]): number {
  const [command] = args;
  const wikiDir = resolve(option(args, 'wiki') ?? resolve(ROOT, 'wiki'));
  if (command === 'check') {
    const tracked = trackedFiles();
    const r = checkWiki({ wikiDir, tracked });
    // The coverage matrix is checked against the repository's own `docs/`, for the repository's wiki (or any wiki
    // folder that carries a matrix).
    const counters: string[] = [];
    if (r.manifest && (wikiDir === resolve(ROOT, 'wiki') || existsSync(coveragePath(wikiDir)))) {
      const c = checkCoverage({ wikiDir, root: ROOT, manifest: r.manifest, tracked });
      r.errors.push(...c.errors);
      r.warnings.push(...c.warnings);
      r.gaps.push(...c.gaps);
      if (c.counters) counters.push(...counterLines(c.counters));
    }
    for (const e of r.errors) console.error(`✖  ${e}`);
    for (const w of r.warnings) console.warn(`⚠  ${w}`);
    for (const g of r.gaps) console.log(`·  ${g}`);
    for (const l of counters) console.log(`·  ${l}`);
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
    if (args.includes('--json')) {
      const { coverage } = readCoverage(wikiDir);
      console.log(JSON.stringify(coverage ? { ...s, coverage: coverageCounters(coverage) } : s));
    } else {
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
      const { coverage } = readCoverage(wikiDir);
      if (coverage) for (const l of counterLines(coverageCounters(coverage))) console.log(l);
    }
    return 0;
  }
  if (command === 'coverage') return coverage(args, wikiDir);
  if (command === 'build') {
    const target = option(args, 'target') ?? 'wiki';
    const out = option(args, 'out');
    if (target !== 'wiki' || !out)
      throw new UsageError('build needs --target wiki and --out <dir> (html and bundle come in A4–A5)');
    const refused = outProblem(out);
    if (refused) {
      console.error(`✖  ${refused}`);
      return 1;
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
  throw new UsageError(command ? `unknown command "${command}"` : 'a command is needed');
}

/**
 * `coverage --init` makes the matrix from the inventory (refusing to replace one without `--force`); `coverage` merges
 * a new inventory into it. Both write `legacy.json` and the manifest's `replaces`, then print the inventory's counts,
 * the incoming anchored links that resolve to nothing, and the two counters. `--root=<dir>` inventories another
 * repository (the tests' fixtures).
 */
function coverage(args: readonly string[], wikiDir: string): number {
  const root = resolve(option(args, 'root') ?? ROOT);
  const { manifest, errors } = readManifest(wikiDir);
  if (!manifest) {
    for (const e of errors) console.error(`✖  ${e}`);
    return 1;
  }
  const files = inventory(root);
  const init = args.includes('--init');
  let matrix: ReturnType<typeof initCoverage>;
  if (init) {
    if (existsSync(coveragePath(wikiDir)) && !args.includes('--force')) {
      console.error(
        `✖  ${coveragePath(wikiDir)} exists: \`coverage\` merges into it; --init --force replaces it, losing every decision`,
      );
      return 1;
    }
    matrix = initCoverage(files);
  } else {
    const read = readCoverage(wikiDir);
    if (!read.coverage) {
      for (const e of read.errors) console.error(`✖  ${e}`);
      return 1;
    }
    const merged = mergeCoverage(read.coverage, files);
    matrix = merged.coverage;
    for (const [what, keys] of [
      ['new', merged.added],
      ['changed', merged.changed],
      ['gone', merged.removed],
    ] as const)
      for (const k of keys) console.log(`·  ${what}: ${k} (flagged: carry it into the wiki pages)`);
  }
  try {
    writeCoverage(wikiDir, matrix, manifest);
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    return 1;
  }
  const sections = files.flatMap((f) => f.sections);
  const links = incomingLinks(root, root === ROOT ? trackedFiles() : [], new Set(files.map((f) => f.file)));
  const unresolved = unresolvedLinks(files, links);
  for (const l of unresolved)
    console.warn(`⚠  ${l.from} line ${l.line}: links to ${l.target}#${l.anchor}, an anchor the page does not have`);
  console.log(
    `✔  ${files.length} pages: ${sections.length} sections, ${files.reduce((n, f) => n + f.anchors.length, 0)} anchors, ${sections.reduce((n, s) => n + s.codeBlocks.length, 0)} code blocks, ${sections.reduce((n, s) => n + s.limits.length, 0)} limit candidates; ${links.length} incoming anchored links, ${unresolved.length} unresolved`,
  );
  for (const l of counterLines(coverageCounters(matrix))) console.log(l);
  return 0;
}

if (process.argv[1]?.endsWith('wiki.ts')) process.exit(main(process.argv.slice(2)));
