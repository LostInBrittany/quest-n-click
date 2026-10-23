// `npm run wiki -- check`, the work level (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "States and check levels"):
// the consistency of what exists, on every pull request. The manifest is valid; a `planned` page has no file and a
// `draft` or `ready` page has both; every file under `wiki/en/` and `wiki/fr/` is a manifest page; a written page says
// which versions it applies to and which files it rests on, and each of its source globs matches a tracked file; a
// how-to or a troubleshooting page carries a question per language; links reach known pages and existing sections;
// two `ready` twins keep the same section ids, link destinations and structured blocks. A link to a `planned` page is
// allowed and listed: writing proceeds page by page. Only errors fail the command; warnings and gaps are printed. The
// publication level (`check --publish`, A5) is stricter and is not this one.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '../game';
import { readGlossary } from './glossary';
import {
  DOMAIN_IDS,
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

/** A glob as a regular expression over a whole path: `**` any folders, `*` and `?` inside one name, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) re += '\\{';
      else {
        re += `(?:${glob
          .slice(i + 1, end)
          .split(',')
          .map((s) => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&'))
          .join('|')})`;
        i = end;
      }
    } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

interface PlannedLink {
  from: string;
  lang: Lang;
  to: string;
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
}

const fileOf = (wikiDir: string, lang: Lang, id: string) => resolve(wikiDir, lang, `${id}.md`);
const isWritten = (p: Page) => p.state !== 'planned';
const needsQuestions = (p: Page) => typesOf(p).some((t) => t === 'howto' || t === 'troubleshooting');
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const [x, y] = [[...new Set(a)].sort(), [...new Set(b)].sort()];
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const diff = (a: readonly string[], b: readonly string[]) => a.filter((v) => !b.includes(v));

/** The `.md` files under a folder, as paths relative to it. */
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

export function checkWiki({ wikiDir, tracked }: CheckOptions): CheckReport {
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

  const globHits = new Map<string, number>();
  const pagesPerFile = new Map<string, string[]>();
  const missingQuestions: string[] = [];
  for (const p of manifest.pages) {
    const where = `${p.id} (${p.state})`;
    for (const lang of LANGS) {
      const exists = existsSync(fileOf(wikiDir, lang, p.id));
      if (!isWritten(p) && exists) report.errors.push(`${where}: planned, yet ${lang}/${p.id}.md exists`);
      if (isWritten(p) && !exists) report.errors.push(`${where}: ${lang}/${p.id}.md is missing (both languages)`);
    }
    // The sources resolve whatever the state: a glob that matches nothing is a typo now, not at writing time.
    const fed = new Set<string>();
    for (const glob of p.sources) {
      const re = globToRegExp(glob);
      const hits = tracked.filter((f) => re.test(f));
      globHits.set(glob, hits.length);
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
      if (existsSync(file)) parsed.set(`${lang}/${p.id}`, parsePage(readFileSync(file, 'utf8')));
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
      if (target.state === 'planned') {
        report.plannedLinks.push({ from: id, lang, to: link.id, line: link.line });
        continue;
      }
      const targetPage = parsed.get(`${lang}/${link.id}`);
      if (link.anchor && targetPage && !targetPage.sections.includes(link.anchor))
        report.errors.push(`${at}: ${link.id}.md#${link.anchor} is not a section of ${lang}/${link.id}.md`);
    }
    for (const link of page.repoLinks)
      if (!trackedSet.has(link.path) && !tracked.some((f) => f.startsWith(`${link.path}/`)))
        report.errors.push(`${key}.md line ${link.line}: links to ${link.path}, which git does not track`);
  }

  // Ready twins say the same thing (§4.7.1, the parts a machine can compare now; examples and steps come later).
  for (const p of manifest.pages.filter((x) => x.state === 'ready')) {
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

  const planned = manifest.pages.filter((p) => p.state === 'planned').length;
  if (planned) report.gaps.push(`${planned} of ${manifest.pages.length} pages are planned (no file yet)`);
  for (const l of report.plannedLinks)
    report.gaps.push(`${l.lang}/${l.from}.md line ${l.line} links to ${l.to}, planned`);
  if (missingQuestions.length)
    report.gaps.push(
      `${missingQuestions.length} planned how-to or troubleshooting pages have no question in both languages yet: ${missingQuestions.join(', ')}`,
    );
  return report;
}

/** The templates of `wiki/_templates/` are not pages, but a pair keeps the same section ids and blocks. */
function checkTemplates(wikiDir: string, report: CheckReport): void {
  const dir = resolve(wikiDir, '_templates');
  const names = walk(dir).filter((f) => f.endsWith('.en.md'));
  for (const en of names) {
    const fr = en.replace(/\.en\.md$/, '.fr.md');
    if (!existsSync(join(dir, fr))) {
      report.errors.push(`_templates/${en}: its French twin ${fr} is missing`);
      continue;
    }
    const [a, b] = [en, fr].map((f) => parsePage(readFileSync(join(dir, f), 'utf8')));
    for (const problem of [...a!.problems, ...b!.problems]) report.errors.push(`_templates/${en}: ${problem}`);
    if (
      !sameSet(a!.sections, b!.sections) ||
      !sameSet(
        a!.blocks.map((x) => x.id),
        b!.blocks.map((x) => x.id),
      )
    )
      report.errors.push(`_templates/${en} and ${fr}: the section ids or blocks differ`);
  }
}

export interface WikiStats {
  total: number;
  byState: Record<string, number>;
  byDomain: Record<string, number>;
  byType: Record<string, number>;
  /** Pages with a file in each language (the planned ones have none yet). */
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
    byState: count(STATES, (p) => p.state),
    byDomain: count(DOMAIN_IDS, (p) => p.domain),
    byType: count(PAGE_TYPES, (p) => p.type),
    byLanguage: {
      en: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'en', p.id))).length,
      fr: manifest.pages.filter((p) => existsSync(fileOf(wikiDir, 'fr', p.id))).length,
    },
  };
}
