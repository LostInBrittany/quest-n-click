// `npm run wiki -- check`, the work level (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "States and check levels"):
// the consistency of what exists, on every pull request. The manifest is valid; a `planned` page has no file and a
// `draft` or `ready` page has both; a generated page never has one; every file under `wiki/en/` and `wiki/fr/` is a
// manifest page; a written page says which versions it applies to and which files it rests on, and each source glob
// matches a tracked file; a how-to or a troubleshooting page carries a question per language; links reach known
// pages, existing sections, tracked files and the wiki's images; two `ready` twins keep the same section ids, link
// destinations and structured blocks. A link to a `planned` page is allowed and listed: writing proceeds page by page.
// Only errors fail the command; warnings and gaps (planned pages, missing questions, identifiers no page claims yet)
// are printed. The publication level (`check --publish`) comes in A5 and is stricter.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globToRegExp } from '../ci-plan';
import { ROOT } from '../game';
import { readGlossary } from './glossary';
import { generatedIdentifiers, type Identifier } from './identifiers';
import {
  DOMAIN_IDS,
  GENERATED_INDEXES,
  LANGS,
  type Lang,
  type Manifest,
  PAGE_TYPES,
  type Page,
  readManifest,
  STATES,
  typesOf,
} from './manifest';
import { linkDestinations, type ParsedPage, parsePage } from './page';

/** A glob past this many files, or a file feeding more pages than this, makes an ordinary change ask too much (§9). */
const GLOB_WARN_FILES = 25;
const FILE_WARN_PAGES = 10;

/** The files git tracks in the repository, the universe a source glob is matched against. */
export function trackedFiles(root = ROOT): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

interface PlannedLink {
  from: string;
  lang: Lang;
  to: string;
  anchor?: string;
  line: number;
}
export interface CheckReport {
  errors: string[];
  warnings: string[];
  /** What is still to write, said so a person can pick it up: never a failure at this level. */
  gaps: string[];
  /** Links from a written page to a page still `planned`: allowed, and listed. */
  plannedLinks: PlannedLink[];
  manifest?: Manifest;
}

export interface CheckOptions {
  /** The wiki's source folder (`wiki/` of the repository, or a test fixture). */
  wikiDir: string;
  /** The repository's tracked files, relative to its root. */
  tracked: readonly string[];
  /** The identifiers a page should claim (npm scripts, MCP tools); read from the repository when absent. */
  identifiers?: readonly Identifier[];
}

const fileOf = (wikiDir: string, lang: Lang, id: string) => resolve(wikiDir, lang, `${id}.md`);
const isWritten = (p: Page) => !p.generated && p.state !== 'planned';
const needsQuestions = (p: Page) => typesOf(p).some((t) => t === 'howto' || t === 'troubleshooting');
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const [x, y] = [[...new Set(a)].sort(), [...new Set(b)].sort()];
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const diff = (a: readonly string[], b: readonly string[]) => [...new Set(a.filter((v) => !b.includes(v)))];

/** The files under a folder, as paths relative to it. */
function walk(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, `${prefix}${name}/`));
    else out.push(`${prefix}${name}`);
  }
  return out;
}

export function checkWiki({ wikiDir, tracked, identifiers }: CheckOptions): CheckReport {
  const report: CheckReport = { errors: [], warnings: [], gaps: [], plannedLinks: [] };
  const { manifest, errors } = readManifest(wikiDir);
  report.errors.push(...errors);
  const glossary = readGlossary(wikiDir);
  report.errors.push(...glossary.errors);
  checkTemplates(wikiDir, report);
  if (!manifest) return report;
  report.manifest = manifest;
  const byId = new Map(manifest.pages.map((p) => [p.id, p]));
  for (const term of glossary.glossary.terms)
    for (const id of term.pages)
      if (!byId.has(id)) report.errors.push(`data/glossary.json: the term ${term.id} names ${id}, not a manifest page`);

  // Files and the manifest, both ways.
  for (const lang of LANGS)
    for (const rel of walk(resolve(wikiDir, lang))) {
      const id = rel.endsWith('.md') && !rel.includes('/') ? rel.slice(0, -3) : undefined;
      if (!id || !byId.has(id))
        report.errors.push(`${lang}/${rel}: not a page of the manifest (a page is ${lang}/<id>.md, its id listed)`);
    }

  const pagesPerFile = new Map<string, string[]>();
  const missingQuestions: string[] = [];
  for (const p of manifest.pages) {
    const where = `${p.id} (${p.generated ? 'generated' : p.state})`;
    if (p.generated && !(GENERATED_INDEXES as readonly string[]).includes(p.id))
      report.errors.push(`${where}: no generator builds it (${GENERATED_INDEXES.join(', ')})`);
    for (const lang of LANGS) {
      const exists = existsSync(fileOf(wikiDir, lang, p.id));
      if (p.generated) {
        if (exists) report.errors.push(`${where}: generated, yet ${lang}/${p.id}.md exists (its source is the data)`);
      } else if (!isWritten(p) && exists) report.errors.push(`${where}: planned, yet ${lang}/${p.id}.md exists`);
      else if (isWritten(p) && !exists) report.errors.push(`${where}: ${lang}/${p.id}.md is missing (both languages)`);
    }
    // The sources resolve whatever the state: a glob that matches nothing is a typo now, not at writing time.
    const fed = new Set<string>();
    for (const glob of p.sources) {
      const re = globToRegExp(glob);
      const hits = tracked.filter((f) => re.test(f));
      if (!hits.length) report.errors.push(`${p.id}: the source "${glob}" matches no tracked file`);
      else if (hits.length > GLOB_WARN_FILES)
        report.warnings.push(`${p.id}: the source "${glob}" covers ${hits.length} files (> ${GLOB_WARN_FILES})`);
      for (const f of hits) fed.add(f);
    }
    for (const f of fed) pagesPerFile.set(f, [...(pagesPerFile.get(f) ?? []), p.id]);
    const noQuestion = LANGS.filter((l) => !p.questions[l].length);
    if (needsQuestions(p) && noQuestion.length) {
      if (isWritten(p))
        report.errors.push(
          `${where}: a ${typesOf(p).join('/')} page asks at least one question in ${noQuestion.join(' and ')}`,
        );
      else missingQuestions.push(p.id);
    }
    // Versions and sources are required from `draft` on: a planned page may not know them yet (§4.1).
    if (isWritten(p)) {
      if (!p.versions?.appliesFrom) report.errors.push(`${where}: versions.appliesFrom is required once a file exists`);
      if (!p.sources.length) report.errors.push(`${where}: sources is required once a file exists`);
    }
  }
  for (const [file, ids] of pagesPerFile)
    if (ids.length > FILE_WARN_PAGES)
      report.warnings.push(`${file} feeds ${ids.length} pages (> ${FILE_WARN_PAGES}): ${ids.join(', ')}`);

  // The written pages, read once.
  const parsed = new Map<string, ParsedPage>();
  for (const p of manifest.pages.filter(isWritten))
    for (const lang of LANGS) {
      const file = fileOf(wikiDir, lang, p.id);
      if (existsSync(file)) parsed.set(`${lang}/${p.id}`, parsePage(readFileSync(file, 'utf8'), lang));
    }
  const trackedSet = new Set(tracked);
  for (const [key, page] of parsed) {
    const [lang, id] = key.split('/') as [Lang, string];
    for (const problem of page.problems) report.errors.push(`${key}.md ${problem}`);
    for (const own of page.ownAnchors)
      if (!page.sections.includes(own.anchor))
        report.errors.push(`${key}.md line ${own.line}: #${own.anchor} is not a section of this page`);
    for (const link of page.links) {
      const target = byId.get(link.id);
      const at = `${key}.md line ${link.line}`;
      if (!target) {
        report.errors.push(`${at}: links to ${link.id}, which the manifest does not hold`);
        continue;
      }
      if (target.generated) {
        if (link.anchor) report.errors.push(`${at}: ${link.id} is generated and has no section ids`);
        continue;
      }
      if (target.state === 'planned') {
        report.plannedLinks.push({ from: id, lang, to: link.id, anchor: link.anchor, line: link.line });
        continue;
      }
      const targetPage = parsed.get(`${lang}/${link.id}`);
      if (link.anchor && targetPage && !targetPage.sections.includes(link.anchor))
        report.errors.push(`${at}: ${link.id}.md#${link.anchor} is not a section of ${lang}/${link.id}.md`);
    }
    for (const link of page.repoLinks)
      if (!trackedSet.has(link.path) && !tracked.some((f) => f.startsWith(`${link.path}/`)))
        report.errors.push(`${key}.md line ${link.line}: links to ${link.path}, which git does not track`);
    for (const image of page.images)
      if (!existsSync(resolve(wikiDir, 'images', image.path)))
        report.errors.push(`${key}.md line ${image.line}: the image images/${image.path} does not exist`);
  }

  // Ready twins say the same thing (§4.7.1, the parts a machine can compare now; examples and steps come later).
  for (const p of manifest.pages.filter((x) => x.state === 'ready' && !x.generated)) {
    const [en, fr] = [parsed.get(`en/${p.id}`), parsed.get(`fr/${p.id}`)];
    if (!en || !fr) continue;
    const compare = (what: string, a: string[], b: string[]) => {
      if (!sameSet(a, b))
        report.errors.push(
          `${p.id}: the ${what} differ between en and fr (only in en: ${diff(a, b).join(', ') || '-'}; only in fr: ${diff(b, a).join(', ') || '-'})`,
        );
    };
    compare('section ids', en.sections, fr.sections);
    compare('link destinations', linkDestinations(en), linkDestinations(fr));
    compare(
      'structured blocks',
      en.blocks.map((b) => `${b.kind}:${b.id}`),
      fr.blocks.map((b) => `${b.kind}:${b.id}`),
    );
  }

  const planned = manifest.pages.filter((p) => p.state === 'planned' && !p.generated).length;
  if (planned) report.gaps.push(`${planned} of ${manifest.pages.length} pages are planned (no file yet)`);
  for (const l of report.plannedLinks)
    report.gaps.push(
      `${l.lang}/${l.from}.md line ${l.line} links to ${l.to}${l.anchor ? `#${l.anchor}` : ''}, planned`,
    );
  if (missingQuestions.length)
    report.gaps.push(
      `${missingQuestions.length} planned how-to or troubleshooting pages have no question in both languages yet: ${missingQuestions.join(', ')}`,
    );
  const claimed = new Set(manifest.pages.flatMap((p) => p.identifiers));
  const unclaimed = (identifiers ?? generatedIdentifiers()).filter((i) => !claimed.has(i.id));
  for (const source of ['npm-script', 'mcp-tool'] as const) {
    const ids = unclaimed.filter((i) => i.source === source).map((i) => i.id);
    if (ids.length)
      report.gaps.push(
        `${ids.length} ${source === 'npm-script' ? 'npm scripts' : 'MCP tools'} no page claims in its identifiers yet: ${ids.join(', ')}`,
      );
  }
  return report;
}

/** The templates of `wiki/_templates/` are not pages, but a pair keeps the same section ids and blocks. */
function checkTemplates(wikiDir: string, report: CheckReport): void {
  const dir = resolve(wikiDir, '_templates');
  const names = walk(dir);
  for (const name of names.filter((f) => f.endsWith('.fr.md')))
    if (!names.includes(name.replace(/\.fr\.md$/, '.en.md')))
      report.errors.push(`_templates/${name}: its English twin is missing`);
  for (const en of names.filter((f) => f.endsWith('.en.md'))) {
    const fr = en.replace(/\.en\.md$/, '.fr.md');
    if (!names.includes(fr)) {
      report.errors.push(`_templates/${en}: its French twin ${fr} is missing`);
      continue;
    }
    const a = parsePage(readFileSync(join(dir, en), 'utf8'), 'en');
    const b = parsePage(readFileSync(join(dir, fr), 'utf8'), 'fr');
    for (const problem of a.problems) report.errors.push(`_templates/${en} ${problem}`);
    for (const problem of b.problems) report.errors.push(`_templates/${fr} ${problem}`);
    if (!sameSet(a.sections, b.sections)) report.errors.push(`_templates/${en} and ${fr}: the section ids differ`);
    if (
      !sameSet(
        a.blocks.map((x) => `${x.kind}:${x.id}`),
        b.blocks.map((x) => `${x.kind}:${x.id}`),
      )
    )
      report.errors.push(`_templates/${en} and ${fr}: the structured blocks differ`);
  }
}

export interface WikiStats {
  total: number;
  byState: Record<string, number>;
  byDomain: Record<string, number>;
  byType: Record<string, number>;
  /** Pages with a file in each language (the planned and generated ones have none). */
  byLanguage: Record<Lang, number>;
}

/** The counts by state, domain, primary type and language: the workload estimate (§4.1, Annex A). */
export function wikiStats(manifest: Manifest, wikiDir: string): WikiStats {
  const count = <K extends string>(keys: readonly K[], of: (p: Page) => K) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const p of manifest.pages) out[of(p)]++;
    return out;
  };
  return {
    total: manifest.pages.length,
    byState: count([...STATES, 'generated'] as const, (p) => (p.generated ? 'generated' : p.state)),
    byDomain: count(DOMAIN_IDS, (p) => p.domain),
    byType: count(PAGE_TYPES, (p) => p.type),
    byLanguage: {
      en: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'en', p.id))).length,
      fr: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'fr', p.id))).length,
    },
  };
}
