// `npm run wiki -- pages --out <dir>` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4 and §4.5.5; ADR 0030): the
// `/docs/` folder of the Pages artifact, assembled ONLY from released archives, never built from the branch:
//   - every release `v<v>` with v ≥ 4.5.0 (pre-releases included: `/docs/<v-rc>/`) and every `docs-v<v>-r<n>`
//     release (a doc revision) gives its `quest-n-click-docs-*.tar.gz`; its sha256 is checked against the release's
//     SHA256SUMS and, for a product release, against the candidate's manifest the release carries; every file inside
//     against the archive's own `bundle-manifest.json`, whose identity must be the tag's;
//   - its `html/` is copied as is to `/docs/<v>/r<n>/`: Pages never renders a page again, so a change to the tools on
//     `main` cannot alter an old version;
//   - `/docs/<v>/` and `/docs/latest/` are aliases (tools/wiki/html.ts `aliasPage`, a page per page that says so) to
//     the revision `publication.json` approves (the record lives in the wiki's repository, copied to
//     `/docs/publication.json`); a pre-release's `/docs/<v-rc>/` points to its one revision, r1;
//   - `/docs/preview/` only in the bootstrap (§4.5.3): no release ≥ 4.5.0 yet, and a preview recorded;
//   - with no release ≥ 4.5.0 at all, a placeholder page pointing to the 4.4.0 documentation (`blob/v4.4.0/docs/`).
// Two parts: `downloadReleases` (the one that needs `gh` and the network) puts each release's files in a folder of
// its own; `assemblePages` reads those folders and the record and writes the tree, the same bytes for the same inputs
// whatever the branch's `wiki/` holds (§4.5.5's required test).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { archiveName, readArchive } from './archive';
import { BOOTSTRAP_LATEST } from './build';
import { compareVersions } from './docs';
import { aliasPage, STYLE_CSS } from './html';
import { formatJson } from './json';
import { SEMVER } from './page';
import type { Publication } from './publication';

/** The first release whose documentation is an archive (§4.5.4); the older ones keep `blob/v<v>/docs/`. */
const FIRST_ARCHIVED = '4.5.0';
const REPO_URL = 'https://github.com/wanoo/quest-n-click';
/** The archive's folder in the candidate's manifest (tools/release/artifacts.mjs, `docs:archive`). */
const IN_CANDIDATE = 'docs/';
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What a release tag is for the documentation: a product release (r1), a doc revision, a preview, or nothing. */
export type DocsTag =
  | { kind: 'release'; version: string; revision: 'r1'; prerelease: boolean }
  | { kind: 'revision'; version: string; revision: string }
  | { kind: 'preview'; version: string };

export function docsTag(tag: string): DocsTag | undefined {
  const rel = /^v(.+)$/.exec(tag);
  if (rel && SEMVER.test(rel[1]!) && compareVersions(rel[1]!, FIRST_ARCHIVED) >= 0)
    return { kind: 'release', version: rel[1]!, revision: 'r1', prerelease: rel[1]!.includes('-') };
  // A pre-release of 4.5.0 sorts before it: still a release whose documentation is archived.
  if (rel && SEMVER.test(rel[1]!) && compareVersions(rel[1]!.replace(/-.*$/, ''), FIRST_ARCHIVED) >= 0)
    return { kind: 'release', version: rel[1]!, revision: 'r1', prerelease: true };
  const rev = /^docs-v(.+)-(r[1-9]\d*)$/.exec(tag);
  if (rev && SEMVER.test(rev[1]!) && !rev[1]!.includes('-') && rev[2] !== 'r1')
    return { kind: 'revision', version: rev[1]!, revision: rev[2]! };
  const pre = /^docs-v(.+)-preview-[0-9a-f]{12}$/.exec(tag);
  if (pre && SEMVER.test(pre[1]!)) return { kind: 'preview', version: pre[1]! };
  return undefined;
}

/** The archive a tag's release carries, by its file name. */
const archiveOf = (t: DocsTag) =>
  t.kind === 'preview' ? archiveName(t.version, 'r1', true) : archiveName(t.version, t.revision);

/**
 * Downloads, for each release of the repository that carries documentation, its archive, its sums and (a product
 * release) its candidate's manifest into `<dir>/<tag>/`. Drafts are left out. Needs `gh` and a token.
 */
export function downloadReleases(repo: string, dir: string): string[] {
  const gh = (args: string[]) =>
    execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
  const list = JSON.parse(gh(['release', 'list', '--repo', repo, '--limit', '1000', '--json', 'tagName,isDraft'])) as {
    tagName: string;
    isDraft: boolean;
  }[];
  const tags = list
    .filter((r) => !r.isDraft && docsTag(r.tagName))
    .map((r) => r.tagName)
    .sort();
  for (const tag of tags) {
    const out = join(dir, tag);
    mkdirSync(out, { recursive: true });
    const t = docsTag(tag)!;
    gh([
      'release',
      'download',
      tag,
      '--repo',
      repo,
      '--dir',
      out,
      '--clobber',
      '--pattern',
      archiveOf(t),
      '--pattern',
      '*SHA256SUMS',
      ...(t.kind === 'release' ? ['--pattern', `quest-n-click-${tag}-candidate.json`] : []),
    ]);
  }
  return tags;
}

/** The sums a SHA256SUMS file gives, by file name. */
const sumsOf = (text: string) =>
  new Map(
    text
      .split('\n')
      .map((l) => /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[2]!, m[1]!]),
  );

interface Loaded {
  tag: string;
  t: DocsTag;
  sha256: string;
  html: Map<string, Buffer>;
}

/** One release's folder read and checked: its archive against its sums, its manifest and its identity. */
function loadRelease(dir: string, tag: string): Loaded {
  const t = docsTag(tag);
  if (!t) throw new Error(`${tag}: not a release with documentation`);
  const name = archiveOf(t);
  const file = join(dir, tag, name);
  if (!existsSync(file)) throw new Error(`${tag}: no ${name}`);
  const bytes = readFileSync(file);
  const digest = sha256(bytes);
  const sumsFile = readdirSync(join(dir, tag)).find((f) => f.endsWith('SHA256SUMS'));
  if (!sumsFile) throw new Error(`${tag}: no SHA256SUMS beside ${name}`);
  const listed = sumsOf(readFileSync(join(dir, tag, sumsFile), 'utf8')).get(name);
  if (listed !== digest) throw new Error(`${tag}: ${name} does not match its SHA256SUMS (${listed ?? 'not listed'})`);
  // A product release's archive is the candidate's, byte for byte (§4.5.4: in candidate-manifest.json).
  if (t.kind === 'release') {
    const cand = join(dir, tag, `quest-n-click-${tag}-candidate.json`);
    if (!existsSync(cand)) throw new Error(`${tag}: no candidate manifest beside ${name}`);
    const pkg = t.version.replace(/-.*$/, '');
    const entry = (
      JSON.parse(readFileSync(cand, 'utf8')) as { artifacts: { name: string; sha256: string }[] }
    ).artifacts.find((a) => a.name === `${IN_CANDIDATE}${archiveName(pkg, 'r1')}`);
    if (entry?.sha256 !== digest)
      throw new Error(`${tag}: ${name} is not the archive the candidate's manifest names (${entry?.sha256 ?? 'none'})`);
  }
  const { files, manifest } = readArchive(bytes);
  // The archive's identity is the tag's: a release's archive names the product version without its pre-release
  // (the candidate builds from package.json), a doc revision its own number, a preview says it is one.
  const want = t.kind === 'release' ? t.version.replace(/-.*$/, '') : t.version;
  if (manifest.productVersion !== want)
    throw new Error(`${tag}: the archive was built for ${manifest.productVersion}, not ${want}`);
  if (t.kind !== 'preview' && manifest.docRevisionNumber !== t.revision)
    throw new Error(`${tag}: the archive is revision ${manifest.docRevisionNumber ?? 'none'}, not ${t.revision}`);
  if ((t.kind === 'preview') !== Boolean(manifest.preview))
    throw new Error(
      `${tag}: ${t.kind === 'preview' ? 'a preview tag on an archive that is not one' : 'a preview archive'}`,
    );
  const html = new Map([...files].filter(([k]) => k.startsWith('html/')).map(([k, v]) => [k.slice('html/'.length), v]));
  if (!html.has('index.html')) throw new Error(`${tag}: the archive has no html/index.html`);
  return { tag, t, sha256: digest, html };
}

export interface AssembleOptions {
  /** A folder per release, as `downloadReleases` fills it. */
  releasesDir: string;
  /** The record, from the wiki's repository; null when none exists yet. */
  publication: Publication | null;
}

/** `/docs/`'s files, by path inside it; the same inputs give the same bytes. */
export function assemblePages(o: AssembleOptions): Map<string, Buffer> {
  const tags = existsSync(o.releasesDir)
    ? readdirSync(o.releasesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && docsTag(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  const loaded = tags.map((tag) => loadRelease(o.releasesDir, tag));
  const out = new Map<string, Buffer>();
  const put = (path: string, data: string | Buffer) => out.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data));
  const stable = loaded.filter((l) => l.t.kind !== 'preview' && !(l.t.kind === 'release' && l.t.prerelease));
  const bootstrap = stable.length === 0;
  const p = o.publication;
  // The permalinks: every revision's site, as it is.
  const permalinks = new Map<string, Loaded>();
  for (const l of loaded) {
    if (l.t.kind === 'preview') continue;
    const at = `${l.t.version}/${l.t.revision}`;
    permalinks.set(at, l);
    for (const [path, b] of l.html) put(`${at}/${path}`, b);
  }
  // The record and the archives agree, or nothing is assembled: a revision recorded is one released.
  for (const [v, entry] of Object.entries(p?.versions ?? {}))
    for (const [r, rec] of Object.entries(entry.revisions)) {
      const l = permalinks.get(`${v}/${r}`);
      if (!l) throw new Error(`publication.json records ${v} ${r}, which no release carries`);
      if (l.sha256 !== rec.sha256)
        throw new Error(
          `publication.json records ${v} ${r} as ${rec.sha256.slice(0, 12)}, the release carries ${l.sha256.slice(0, 12)}`,
        );
    }
  const alias = (prefix: string, target: Loaded, depth: string, what: string) => {
    for (const path of target.html.keys())
      if (path.endsWith('.html'))
        put(`${prefix}/${path}`, aliasPage(`${'../'.repeat(path.split('/').length - 1)}${depth}${path}`, what));
  };
  // /docs/<v>/: the approved revision of each recorded version; a pre-release's only revision.
  const aliased: { version: string; revision: string; note: string }[] = [];
  for (const [v, entry] of Object.entries(p?.versions ?? {}).sort(([a], [b]) => compareVersions(a, b))) {
    alias(v, permalinks.get(`${v}/${entry.approved}`)!, `${entry.approved}/`, `quest'n'click ${v} ${entry.approved}`);
    aliased.push({ version: v, revision: entry.approved, note: 'approved' });
  }
  for (const l of loaded)
    if (l.t.kind === 'release' && l.t.prerelease) {
      alias(l.t.version, l, 'r1/', `quest'n'click ${l.t.version} r1 (pre-release)`);
      aliased.push({ version: l.t.version, revision: 'r1', note: 'pre-release' });
    }
  if (p?.latest) {
    const l = permalinks.get(`${p.latest.version}/${p.latest.revision}`)!;
    alias(
      'latest',
      l,
      `../${p.latest.version}/${p.latest.revision}/`,
      `quest'n'click ${p.latest.version} ${p.latest.revision}, the latest`,
    );
  }
  // The bootstrap's preview, while no release ≥ 4.5.0 is out.
  let preview: Loaded | undefined;
  if (bootstrap && p?.preview) {
    preview = loaded.find((l) => l.t.kind === 'preview' && l.sha256 === p.preview!.sha256);
    if (!preview) throw new Error(`publication.json records a preview (${p.preview.tag}) no release carries`);
    for (const [path, b] of preview.html) put(`preview/${path}`, b);
  }
  if (p) put('publication.json', formatJson(p));
  put('style.css', STYLE_CSS);
  put('index.html', indexPage(aliased, [...permalinks.keys()], p, Boolean(preview), loaded.length === 0));
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** `/docs/index.html`: the versions, their revisions, the aliases said as aliases; or the placeholder. */
function indexPage(
  aliased: { version: string; revision: string; note: string }[],
  permalinks: string[],
  p: Publication | null,
  preview: boolean,
  empty: boolean,
): string {
  const old = `${REPO_URL}/blob/v${BOOTSTRAP_LATEST}/docs/`;
  const rows = [...new Set(permalinks.map((x) => x.split('/')[0]!))]
    .sort((a, b) => compareVersions(b, a))
    .map((v) => {
      const revs = permalinks
        .filter((x) => x.startsWith(`${v}/`))
        .map((x) => x.split('/')[1]!)
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      const a = aliased.find((x) => x.version === v);
      return `<li>${esc(v)}: ${revs.map((r) => `<a href="${esc(v)}/${r}/index.html">${r}</a>`).join(' · ')}${a ? ` — alias <a href="${esc(v)}/index.html">${esc(v)}/</a> → ${a.revision} (${a.note})` : ''}</li>`;
    });
  const body = empty
    ? `<p>No documentation archive is released yet: the documentation of quest'n'click ${BOOTSTRAP_LATEST} is at <a href="${old}">${old}</a>.</p>
<p>Aucune archive de documentation n'est encore publiée : la documentation de quest'n'click ${BOOTSTRAP_LATEST} est sur <a href="${old}">${old}</a>.</p>`
    : `${p?.latest ? `<p>Latest · dernière : <a href="latest/index.html">latest/</a> (alias of · alias de ${esc(p.latest.version)} ${esc(p.latest.revision)}).</p>` : `<p>No release of the documentation is published yet · aucune documentation publiée pour l'instant: ${BOOTSTRAP_LATEST} is at <a href="${old}">${old}</a>.</p>`}
${preview ? '<p><a href="preview/index.html">preview/</a>: the preview of the next documentation · l\'aperçu de la prochaine documentation.</p>\n' : ''}<p>A permalink names its revision (<code>/docs/&lt;version&gt;/r&lt;n&gt;/</code>); <code>/docs/&lt;version&gt;/</code> and <code>/docs/latest/</code> are aliases. Publication record: <a href="publication.json">publication.json</a>. Earlier versions: <a href="${old}">${old}</a> and the tags before it.</p>
<ul>
${rows.join('\n')}
</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>quest'n'click documentation</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
<h1>quest'n'click documentation · documentation</h1>
${body}
</main>
</body>
</html>
`;
}

/** Writes `/docs/` into an empty (or absent) folder; returns the paths written. */
export function writePages(outDir: string, files: Map<string, Buffer>): string[] {
  if (existsSync(outDir) && readdirSync(outDir).length)
    throw new Error(`${outDir} is not empty: /docs/ is written whole`);
  for (const [path, b] of files) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, b);
  }
  return [...files.keys()];
}
