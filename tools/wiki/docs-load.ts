// Where the documentation the tools read comes from (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.4, "Resolution at
// run time"; ADR 0030). An installed package carries a bundle, `<package>/docs-bundle/` (written by `wiki -- bundle`
// when scripts/pack.mjs packs the engine): the `ready` pages, the index, and `legacy/<NAME>.md`, the eight historical
// pages `read_doc {name}` serves. The engine's repository has no bundle: the same loader reads `wiki/` directly, the
// `draft` and `ready` pages, and says it is a repository preview; `read_doc {name}` reads `docs/en/<NAME>.md`
// there, unchanged until the switch-over (C2). A package never reads `docs/en`, and the new tools never read it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BUNDLE_FORMAT,
  type DocsIndex,
  type DocsLang,
  type DocsSet,
  formatProblem,
  INDEX_FORMAT,
  type IndexPage,
  type Provenance,
  splitSections,
} from './docs';
import { readGlossary } from './glossary';
import { LANGS, type Page, readManifest } from './manifest';

/** The bundle's folder in an installed package, beside its package.json. */
export const BUNDLE_DIR = 'docs-bundle';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** What `bundle-manifest.json` holds (format v1): the bundle's identity and the hash of each of its files. */
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: 1;
  productVersion: string;
  productCommit: string;
  docRevision: string;
  buildId?: string;
  /** The git tree of `wiki/` at the doc revision, when git knows it. */
  wikiTree: string | null;
  files: { path: string; sha256: string; bytes: number }[];
}

/**
 * The index of a wiki folder's written pages in the given states (a page `planned` or `generated` has no text and
 * is never in it) and their Markdown by `<lang>/<id>`. `transform` rewrites a page's text first (the bundle's links);
 * the index's hashes are those of the text it returns. Throws with the manifest's problems when it is not valid.
 */
export function indexWiki(
  wikiDir: string,
  states: readonly ('draft' | 'ready')[],
  transform: (markdown: string, lang: DocsLang, page: Page) => string = (m) => m,
): { index: DocsIndex; pages: Record<string, string> } {
  const { manifest, errors } = readManifest(wikiDir);
  if (!manifest) throw new Error(`the wiki's manifest is not valid: ${errors.join('; ')}`);
  const { glossary } = readGlossary(wikiDir);
  const legacyFile = resolve(wikiDir, 'legacy.json');
  const legacy = existsSync(legacyFile)
    ? ((JSON.parse(readFileSync(legacyFile, 'utf8')) as { pages?: Record<string, string[]> }).pages ?? {})
    : {};
  const pages: Record<string, string> = {};
  const entries: IndexPage[] = [];
  for (const p of manifest.pages) {
    if (p.generated || p.state === 'planned' || !states.includes(p.state)) continue;
    const langs: IndexPage['langs'] = {};
    for (const lang of LANGS) {
      const file = resolve(wikiDir, lang, `${p.id}.md`);
      if (!existsSync(file)) continue;
      const text = transform(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), lang, p);
      pages[`${lang}/${p.id}`] = text;
      langs[lang] = {
        file: `md/${lang}/${p.id}.md`,
        sha256: sha256(text),
        sections: splitSections(text).map((s) => ({ id: s.id, title: s.title, sha256: sha256(s.text) })),
      };
    }
    entries.push({
      id: p.id,
      domain: p.domain,
      type: p.type,
      ...(p.alsoTypes ? { alsoTypes: p.alsoTypes } : {}),
      audience: p.audience,
      context: p.context,
      ...(p.versions ? { versions: p.versions } : {}),
      state: p.state,
      title: p.title,
      url: p.url,
      questions: p.questions,
      aliases: p.aliases,
      keywords: p.keywords ?? { en: [], fr: [] },
      identifiers: p.identifiers,
      langs,
    });
  }
  return {
    index: {
      format: INDEX_FORMAT,
      version: 1,
      pages: entries,
      glossary: glossary.terms.map((t) => ({
        id: t.id,
        en: { term: t.en.term, synonyms: t.en.synonyms },
        fr: { term: t.fr.term, synonyms: t.fr.synonyms },
        pages: t.pages,
      })),
      legacy,
    },
    pages,
  };
}

const heads = new Map<string, string>();
/** `git rev-parse HEAD` of a checkout, once per process; 'unknown' outside git. */
function gitHead(root: string): string {
  let h = heads.get(root);
  if (h === undefined) {
    try {
      h = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      h = 'unknown';
    }
    heads.set(root, h);
  }
  return h;
}

const productVersion = (root: string) =>
  String((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }).version);

/**
 * The repository's documentation, read from `wiki/` as it is in the checkout: the `draft` and `ready` pages (`states`
 * narrows it: the demo snapshot embeds the `ready` ones only). A preview, never a publication.
 */
export function repositoryDocs(
  root: string,
  o: { wikiDir?: string; states?: readonly ('draft' | 'ready')[]; label?: string } = {},
): DocsSet {
  const head = gitHead(root);
  const { index, pages } = indexWiki(o.wikiDir ?? join(root, 'wiki'), o.states ?? ['draft', 'ready']);
  return {
    provenance: {
      source: 'repository',
      productVersion: productVersion(root),
      productCommit: head,
      docRevision: head,
      label:
        o.label ??
        'repository preview: the draft and ready pages of wiki/ in this checkout, not a published documentation',
    },
    index,
    pages,
  };
}

/** A JSON file of the bundle, its format and version checked: an unknown major version is refused, plainly. */
function readVersioned<T>(file: string, format: string, label: string): T {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const problem = formatProblem(raw, format, label);
  if (problem) throw new Error(problem);
  return raw as T;
}

/** A bundle folder's documentation: its identity from `bundle-manifest.json`, its index and its pages. */
export function bundleDocs(dir: string): DocsSet {
  const m = readVersioned<BundleManifest>(
    join(dir, 'bundle-manifest.json'),
    BUNDLE_FORMAT,
    `${BUNDLE_DIR}/bundle-manifest.json`,
  );
  const index = readVersioned<DocsIndex>(join(dir, 'index.json'), INDEX_FORMAT, `${BUNDLE_DIR}/index.json`);
  const pages: Record<string, string> = {};
  for (const p of index.pages)
    for (const lang of LANGS) {
      const f = p.langs[lang]?.file;
      if (f) pages[`${lang}/${p.id}`] = readFileSync(join(dir, f), 'utf8');
    }
  const provenance: Provenance = {
    source: 'bundle',
    productVersion: m.productVersion,
    productCommit: m.productCommit,
    docRevision: m.docRevision,
    ...(m.buildId ? { buildId: m.buildId } : {}),
    label: `bundle built for quest'n'click ${m.productVersion}${m.buildId ? `, build ${m.buildId}` : ''}; whether it was promoted to a release is recorded outside it (publication.json)`,
  };
  return { provenance, index, pages };
}

/** The bundle of an installed engine, or undefined in the repository (no `docs-bundle/` beside package.json). */
const bundleOf = (root: string): string | undefined => {
  const dir = join(root, BUNDLE_DIR);
  return existsSync(join(dir, 'bundle-manifest.json')) ? dir : undefined;
};

/** The documentation the new tools read: the package's bundle when there is one, otherwise the repository's `wiki/`. */
export function resolveDocs(root: string): DocsSet {
  const bundle = bundleOf(root);
  return bundle ? bundleDocs(bundle) : repositoryDocs(root);
}

/**
 * One of the eight historical pages, `read_doc {name}`: the bundle's exact copy in a package, `docs/en/<NAME>.md` in
 * the repository (unchanged until C2).
 */
export function legacyDoc(root: string, name: string): string {
  const bundle = bundleOf(root);
  return readFileSync(bundle ? join(bundle, 'legacy', `${name}.md`) : join(root, 'docs', 'en', `${name}.md`), 'utf8');
}
