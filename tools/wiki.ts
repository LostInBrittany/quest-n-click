// npm run wiki -- check | stats [--json] | coverage [--init [--force] | --ack <key>] | build --target wiki --out <dir> [--preview]
// [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | bundle --out <dir> [--build-id <id>] [--allow-dirty]
// [the same three] | check --publish --product-ref <tag|sha> [--doc-ref <sha>] [--released] [--state preview|candidate|published]
// [--test-report <vitest.json>]… [--candidate <run id>] | review-claim <id> --by <name> | translations --ack <id#section> --by <name>
// (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §5, phases A2 to A5; ADR 0030).
// The documentation's source is `wiki/` (a manifest, then `wiki/<lang>/<id>.md`); every output is generated from it.
// `check` is the work level of every pull request: it fails on errors only, and prints the warnings and what is still
// to write. `stats` counts the pages by state, domain, type and language: the workload estimate. `build --target
// wiki` writes the folder a publication pushes to the GitHub wiki; it publishes the `ready` pages, and the `draft`
// ones too with `--preview`. `coverage --init` takes the anchor inventory of the old documentation into
// `wiki/coverage.json`; `coverage` merges a new inventory into it, keeping what a person wrote, and regenerates
// `wiki/legacy.json` and the manifest's `replaces` (§4.2). `bundle` writes the documentation an installed engine
// carries (tools/wiki/bundle.ts, §4.3.4), into the package scripts/pack.mjs prepares: never under a folder the
// repository tracks. `check --publish` is the publication level (§4.1.4): the published pages reach ready pages only,
// no translation is to review, every claim was executed on the product (`--test-report`, a Vitest JSON report with
// the `commit.json` the candidate writes beside it; `--candidate <run>` names the run they must come from, required for
// `--state candidate|published`), and the source set is the product's plus documentation only
// (§4.5.2). `review-claim` records that a person checked a claim's test covers it (`wiki/reviews.json`);
// `translations --ack` that a section's two languages were read against each other (`wiki/translations.json`). The
// other commands of §5 (`publish`…) come with their phases. `--wiki=<dir>` reads another source folder (the tests' fixtures). The output folder is outside the
// working tree (or under `.cache/`), so a build never lands among the sources, and only a previous build is emptied.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ROOT } from './game';
import { buildWiki } from './wiki/build';
import { dirtySources, writeBundle } from './wiki/bundle';
import { checkWiki, trackedFiles, wikiStats } from './wiki/check';
import { claimLabel, reviewClaim } from './wiki/claims';
import {
  ackRow,
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
import { ackTranslation } from './wiki/translations';

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

/** Every value of a repeatable option (`--test-report a.json --test-report b.json`). */
function options(args: readonly string[], name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === `--${name}` || a.startsWith(`--${name}=`)) out.push(option(args.slice(i), name)!);
  });
  return out;
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

/**
 * Why a bundle's folder is refused: the working tree itself, or a folder in it that holds tracked files (a shipped
 * root, `wiki/`…). A folder git does not track (`.cache/`, the candidate's `pack/`) or one outside the tree is fine.
 */
export function bundleOutProblem(out: string, tracked: readonly string[], root = ROOT): string | undefined {
  const rel = relative(root, resolve(out)).split(sep).join('/');
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined;
  if (rel === '') return `${out} is the repository itself: write the bundle into a package folder`;
  const parts = rel.split('/');
  const under = parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/`);
  if (tracked.some((f) => under.some((u) => f.startsWith(u))))
    return `${out} is inside a folder the repository tracks: write the bundle into a package folder (.cache/, or outside the tree)`;
  return undefined;
}

const USAGE =
  'usage: npm run wiki -- check [--test-report <file>]… | check --publish --product-ref <tag|sha> [--doc-ref <sha>] [--released] [--state preview|candidate|published] [--test-report <file>]… [--candidate <run id>] | review-claim <id> --by <name> | translations --ack <id#section> --by <name> | stats [--json] | coverage [--init [--force] | --ack <key>] | build --target wiki --out <dir> [--preview] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>] | bundle --out <dir> [--build-id <id>] [--allow-dirty] [--product-version <v>] [--doc-revision <sha>] [--product-commit <sha>]';

/** Today, as a day (the date a review or an ack records). */
const today = () => new Date().toISOString().slice(0, 10);

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
    const publish = args.includes('--publish');
    const productRef = option(args, 'product-ref');
    if (publish && !productRef)
      throw new UsageError('check --publish needs --product-ref <tag|sha>, the product documented');
    const state = option(args, 'state') ?? 'published';
    if (!['preview', 'candidate', 'published'].includes(state))
      throw new UsageError('--state is preview, candidate or published');
    const docRef = option(args, 'doc-ref');
    const r = checkWiki({
      wikiDir,
      tracked,
      testReports: options(args, 'test-report').map((f) => resolve(f)),
      ...(option(args, 'candidate') ? { candidate: option(args, 'candidate') } : {}),
      ...(publish
        ? {
            publish: {
              productRef: productRef!,
              ...(docRef ? { docRef } : {}),
              released: args.includes('--released'),
              state: state as 'preview' | 'candidate' | 'published',
            },
          }
        : {}),
    });
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
    for (const c of r.claims) console.log(`·  claim ${c.id} (${c.page}): ${claimLabel(c)}`);
    const n = r.manifest?.pages.length ?? 0;
    const level = publish ? 'publication level' : 'work level';
    if (r.errors.length) {
      console.error(`✖  wiki (${level}): ${r.errors.length} error(s), ${r.warnings.length} warning(s) over ${n} pages`);
      return 1;
    }
    console.log(
      `✔  wiki (${level}): ${n} pages consistent, ${r.warnings.length} warning(s), ${r.plannedLinks.length} link(s) to planned pages`,
    );
    return 0;
  }
  if (command === 'review-claim') {
    const id = args[1];
    const by = option(args, 'by');
    if (!id || id.startsWith('--') || !by) throw new UsageError('review-claim needs <id> and --by <name>');
    const r = checkWiki({ wikiDir, tracked: trackedFiles() });
    const state = r.claims.find((c) => c.id === id);
    if (!state) {
      console.error(`✖  ${id} is no claim of the manifest (${r.claims.map((c) => c.id).join(', ') || 'none'})`);
      return 1;
    }
    const problem = reviewClaim({ wikiDir, state, by, date: today() });
    if (problem) {
      console.error(`✖  ${problem}`);
      return 1;
    }
    console.log(`✔  ${id}: scope reviewed by ${by} (${state.test}); a change to the claim or its test file resets it`);
    return 0;
  }
  if (command === 'translations') {
    const key = option(args, 'ack');
    const by = option(args, 'by');
    if (!key || !by) throw new UsageError('translations needs --ack <id#section> and --by <name>');
    const { manifest, errors } = readManifest(wikiDir);
    if (!manifest) {
      for (const e of errors) console.error(`✖  ${e}`);
      return 1;
    }
    const problem = ackTranslation({ wikiDir, manifest, key, by, date: today() });
    if (problem) {
      console.error(`✖  ${problem}`);
      return 1;
    }
    console.log(`✔  ${key}: the two languages recorded as read against each other by ${by}`);
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
        statuses: r.statuses,
        claims: r.claims,
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
  if (command === 'bundle') {
    const out = option(args, 'out');
    if (!out) throw new UsageError('bundle needs --out <dir>');
    const tracked = trackedFiles();
    const refused = bundleOutProblem(out, tracked);
    if (refused) {
      console.error(`✖  ${refused}`);
      return 1;
    }
    const r = checkWiki({ wikiDir, tracked });
    if (!r.manifest || r.errors.length) {
      for (const e of r.errors) console.error(`✖  ${e}`);
      console.error('✖  the sources do not pass `npm run wiki -- check`: no bundle');
      return 1;
    }
    // The bundle names the commit it was built from: sources changed since then are refused, or said (`-dirty`).
    const dirty = dirtySources(ROOT, wikiDir);
    if (dirty.length && !args.includes('--allow-dirty')) {
      console.error(
        `✖  the bundle's sources differ from HEAD (${dirty.slice(0, 5).join('; ')}${dirty.length > 5 ? '…' : ''}): commit them, or pass --allow-dirty for a bundle marked "-dirty"`,
      );
      return 1;
    }
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };
    const docRevision = option(args, 'doc-revision') ?? head();
    const buildId = option(args, 'build-id');
    let bundle: ReturnType<typeof writeBundle>;
    try {
      bundle = writeBundle({
        root: ROOT,
        wikiDir,
        outDir: resolve(out),
        productVersion: option(args, 'product-version') ?? pkg.version,
        productCommit: option(args, 'product-commit') ?? docRevision,
        docRevision,
        ...(buildId ? { buildId } : {}),
        dirty: dirty.length > 0,
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    const pages = bundle.files.filter((f) => f.path.startsWith('md/')).length;
    const bytes = bundle.files.reduce((n, f) => n + f.bytes, 0);
    console.log(
      `✔  documentation bundle of ${bundle.productVersion} (doc revision ${bundle.docRevision.slice(0, 12)}): ${bundle.files.length} file(s), ${pages} page file(s), ${bytes} bytes → ${resolve(out)}`,
    );
    return 0;
  }
  throw new UsageError(command ? `unknown command "${command}"` : 'a command is needed');
}

/**
 * `coverage --init` makes the matrix from the inventory (refusing to replace one without `--force`); `coverage` merges
 * a new inventory into it, and `--ack <key>` then clears that row's flag once a person rechecked it (a removed row is
 * deleted). Both write `legacy.json` and the manifest's `replaces`, then print the inventory's counts,
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
    for (const c of merged.carried) console.log(`·  carried: ${c.from} → ${c.to} (same body)`);
    for (const [what, keys] of [
      ['new', merged.added],
      ['changed', merged.changed],
      ['gone', merged.removed],
    ] as const)
      for (const k of keys) console.log(`·  ${what}: ${k} (flagged: recheck it, then --ack it)`);
    const ack = option(args, 'ack');
    if (ack) {
      const problem = ackRow(matrix, ack);
      if (problem) {
        console.error(`✖  --ack: ${problem}`);
        return 1;
      }
      console.log(`·  acknowledged: ${ack}`);
    }
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
