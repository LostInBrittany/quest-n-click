// `npm run wiki -- bundle --out <dir>` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.4 and §4.3.5; ADR 0030): the
// documentation an installed engine carries, written by scripts/pack.mjs into the package's `docs-bundle/`, never into
// the repository. It holds:
//   - `index.json` (`quest-n-click-docs-index` v1): the pages, their sections with ids and hashes, titles, questions,
//     aliases, keywords, identifiers, versions and state; the glossary; the legacy order;
//   - `md/<lang>/<id>.md`: the `ready` pages only (a bundle never carries a draft), their links rewritten for a local
//     reading (§4.5.6): another page `../<lang>/<id>.md#<anchor>`, a page not in the bundle its text and "(coming)",
//     the code `blob/<productCommit>/…`, an image of the wiki `../../assets/<path>`;
//   - `legacy/<NAME>.md`: an exact copy of `docs/en/<NAME>.md` for each of the eight `read_doc` names, until C2;
//   - `assets/`: the wiki's images the bundled pages show;
//   - `bundle-manifest.json` (`quest-n-click-docs-bundle` v1): the identity (product version and commit, doc revision,
//     the build when given, the git tree of `wiki/`) and the sha256 of every other file. No publication state: a
//     promotion is recorded outside the bundle, so promoting a candidate changes no byte (§4.5.1).
// Reproducible: no date, no absolute path, files and keys in a fixed order; the same sources give the same bytes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { DOCS } from '../studio/tools';
import { BUNDLE_FORMAT, type DocsLang } from './docs';
import { type BundleManifest, indexWiki, sha256 } from './docs-load';
import { formatJson } from './json';
import { readManifest } from './manifest';
import { classifyTarget, type Link, mapPage, renderLink } from './page';

const REPO_URL = 'https://github.com/wanoo/quest-n-click';

export interface BundleOptions {
  /** The repository (its `docs/en/` for the legacy copies, its git for the tree of `wiki/`). */
  root: string;
  wikiDir: string;
  outDir: string;
  productVersion: string;
  productCommit: string;
  docRevision: string;
  buildId?: string;
}

/** The git tree of the wiki folder at the doc revision, or null when git does not know it (a copy, no checkout). */
function wikiTree(root: string, wikiDir: string, revision: string): string | null {
  const rel = relative(root, wikiDir).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  try {
    return execFileSync('git', ['rev-parse', `${revision}:${rel}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Empties the output folder first, so a page withdrawn leaves nothing behind: only a folder that holds a previous
 * bundle (its `bundle-manifest.json`) or nothing is emptied; any other is refused.
 */
function clearOutput(outDir: string): void {
  if (!existsSync(outDir)) return;
  const entries = readdirSync(outDir);
  if (entries.length && !entries.includes('bundle-manifest.json'))
    throw new Error(`${outDir} is not empty and holds no previous bundle: choose an empty folder`);
  for (const name of entries) rmSync(resolve(outDir, name), { recursive: true, force: true });
}

/** Writes the bundle; returns its manifest (the files written, `bundle-manifest.json` aside, with their hashes). */
export function writeBundle(o: BundleOptions): BundleManifest {
  const { manifest, errors } = readManifest(o.wikiDir);
  if (!manifest) throw new Error(`the wiki's manifest is not valid: ${errors.join('; ')}`);
  const bundled = new Set(manifest.pages.filter((p) => p.state === 'ready' && !p.generated).map((p) => p.id));
  const images = new Set<string>();
  const local = (markdown: string, lang: DocsLang) =>
    mapPage(
      markdown,
      (l: Link) => {
        const t = classifyTarget(l.target, lang);
        const to = (target: string) => renderLink({ ...l, target });
        if (t.kind === 'page')
          return bundled.has(t.id)
            ? to(`../${lang}/${t.id}.md${t.anchor ? `#${t.anchor}` : ''}`)
            : `${l.label} (coming)`;
        if (t.kind === 'repo')
          return to(`${REPO_URL}/blob/${o.productCommit}/${t.path}${t.anchor ? `#${t.anchor}` : ''}`);
        if (t.kind === 'wiki-image') {
          images.add(t.path);
          return to(`../../assets/${t.path}`);
        }
        return undefined;
      },
      (kind, id) => `> [!${kind} id=${id}]`,
    );
  const { index, pages } = indexWiki(o.wikiDir, ['ready'], local);

  const files = new Map<string, Buffer>();
  files.set('index.json', Buffer.from(formatJson(index)));
  for (const [key, text] of Object.entries(pages)) files.set(`md/${key}.md`, Buffer.from(text));
  // The eight historical pages, byte for byte: `read_doc {name}` answers in a package what it answers in the repository.
  for (const name of DOCS) files.set(`legacy/${name}.md`, readFileSync(resolve(o.root, 'docs', 'en', `${name}.md`)));
  for (const image of images) files.set(`assets/${image}`, readFileSync(resolve(o.wikiDir, 'images', image)));

  const paths = [...files.keys()].sort();
  const bundle: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: 1,
    productVersion: o.productVersion,
    productCommit: o.productCommit,
    docRevision: o.docRevision,
    ...(o.buildId ? { buildId: o.buildId } : {}),
    wikiTree: wikiTree(o.root, o.wikiDir, o.docRevision),
    files: paths.map((path) => ({ path, sha256: sha256(files.get(path)!), bytes: files.get(path)!.length })),
  };
  clearOutput(o.outDir);
  for (const path of paths) {
    const file = resolve(o.outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, files.get(path)!);
  }
  writeFileSync(resolve(o.outDir, 'bundle-manifest.json'), formatJson(bundle));
  return bundle;
}

/** Why a bundle's files do not match its manifest (a file missing, changed or not listed); empty when they do. */
export function bundleProblems(dir: string): string[] {
  const m = JSON.parse(readFileSync(resolve(dir, 'bundle-manifest.json'), 'utf8')) as BundleManifest;
  const out: string[] = [];
  const listed = new Set(m.files.map((f) => f.path));
  for (const f of m.files) {
    const file = resolve(dir, f.path);
    if (!existsSync(file)) out.push(`${f.path}: missing`);
    else if (sha256(readFileSync(file)) !== f.sha256) out.push(`${f.path}: its sha256 is not the manifest's`);
  }
  const walk = (d: string, prefix: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(resolve(d, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
    );
  for (const f of walk(dir, ''))
    if (f !== 'bundle-manifest.json' && !listed.has(f)) out.push(`${f}: not in the manifest`);
  return out;
}
