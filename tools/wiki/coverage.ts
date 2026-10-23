// The coverage matrix (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.2, L2; phase A3): nothing of the old documentation is
// lost without a written decision. `wiki -- coverage --init` takes the anchor inventory of the pages that move (the 32
// files of `docs/en` and of `docs/fr`, `PRODUCTION.template.md` included, the two READMEs, CONTRIBUTING, SECURITY,
// CODE_OF_CONDUCT and CREDITS): every heading outside fenced code, from `#` to `######`, with the anchor GitHub computes
// for it (repeated headings get `-1`, `-2`… in document order), the explicit `<a id>` and `<a name>` anchors, every
// fenced code block (the sha256 of its content, its language, its line), and the sentences that look like a limit
// (`only`, `not`, `never`, `uniquement`, `pas encore`, `ne … pas`…): a review aid, never a proof. It writes one row per
// section to `wiki/coverage.json`; a person fills where the section goes (`destinations`, `id#section`, many to many),
// `keep`, `rewrite` or `drop` (a drop says why), and the two states `planned` and `migrated`. `wiki -- coverage` merges
// a new inventory into the matrix: what a person wrote is kept, a new section is added, a section whose text changed or
// that disappeared is flagged. The same run writes `wiki/legacy.json` (the ordered destinations that rebuild each of the
// eight pages `read_doc {name}` serves, §4.3.2) and the manifest's `replaces`, so neither can drift from the matrix.
// `wiki -- check` refuses a matrix out of step with `docs/`: that is the freeze of §4.2.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../game';
import { DOCS } from '../studio/tools';
import { formatJson } from './json';
import { issuesOf, type Manifest, PAGE_ID } from './manifest';
import { mapLine, mapLines, parsePage } from './page';

const COVERAGE_FORMAT = 'quest-n-click-docs-coverage';
const LEGACY_FORMAT = 'quest-n-click-docs-legacy';
/** The root files that move with `docs/en` and `docs/fr` (§4.2). */
const ROOT_FILES = ['README.md', 'README.fr.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CREDITS.md'];
/** The command that brings the matrix back in step, named by every message about it. */
const COVERAGE_COMMAND = 'npm run wiki -- coverage';

/** The files the inventory reads, relative to the repository: `docs/en`, `docs/fr`, then the root files. */
function inventoryFiles(root = ROOT): string[] {
  const docs = (lang: string) => {
    const dir = resolve(root, 'docs', lang);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => `docs/${lang}/${f}`);
  };
  return [...docs('en'), ...docs('fr'), ...ROOT_FILES.filter((f) => existsSync(resolve(root, f)))];
}

// ——— Anchors as GitHub computes them ———

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * The text a heading renders to, the one GitHub makes its anchor from: inline code keeps its content, a link or an
 * image keeps its label, HTML tags and emphasis marks go, escapes and the common entities are read.
 */
export function headingText(raw: string): string {
  const code: string[] = [];
  let s = raw.replace(/(`+)(.+?)\1/g, (_, __, c: string) => {
    code.push(c.trim());
    return `\u0000${code.length - 1}\u0000`;
  });
  s = s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#39|[a-z]+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/\*+/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=$|[^\p{L}\p{N}])/gu, '$1');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => code[Number(i)]!).trim();
}

/** GitHub's slug of a heading's text: lowercase, what is not a letter, mark, digit, `_`, space or `-` removed, spaces to `-`. */
export const githubSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');

/** A page's slugger: a repeated slug gets `-1`, `-2`… in document order, never colliding with one already given. */
export function slugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = githubSlug(text);
    let slug = base;
    while (seen.has(slug)) {
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      slug = `${base}-${n}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

// ——— The inventory ———

interface CodeBlock {
  hash: string;
  lang: string;
  line: number;
}
/** One section of an old page: its heading (none for the text before the first one), its lines, what it holds. */
interface Section {
  key: string;
  file: string;
  heading: string;
  level: number;
  anchor: string;
  lines: [number, number];
  hash: string;
  codeBlocks: CodeBlock[];
  /** The explicit `<a id>` / `<a name>` anchors inside the section. */
  anchors: string[];
  limits: string[];
}
export interface FileInventory {
  file: string;
  sections: Section[];
  /** Every anchor a link can reach in the file: the headings' slugs and the explicit anchors. */
  anchors: string[];
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const EXPLICIT = /<a\s+(?:[^>]*?\s)?(?:id|name)\s*=\s*["']([^"']+)["']/gi;
/**
 * The markers and turns of phrase of a limit (§4.2), English and French (`ne … pas`, and `ne … que`, the French
 * "only"). A sentence without them can still be one: the aid helps a review, it does not replace it.
 */
const LIMIT =
  /\b(only|not|not yet|never|cannot|no longer|local only|warning|limits?|limited|uniquement|seulement|pas encore|jamais|limites?|limitée?s?|attention)\b|n't\b|\b(?:ne|n['’])\s*(?:\S+\s+){0,4}?(?:pas\b|que\b|qu['’])/i;

const METRIC = /(<!-- metric:[\w-]+ -->).*?(<!-- \/metric -->)/g;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const keyOf = (file: string, anchor: string) => (anchor ? `${file}#${anchor}` : file);

/** The sentences of a stretch of prose that carry a limit's marker outside inline code, whitespace collapsed. */
export function limitCandidates(prose: string): string[] {
  const text = prose
    .replace(/<a\s[^>]*><\/a>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  return text
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}«"`*[(_])/u)
    .map((s) => s.trim())
    .filter((s) => LIMIT.test(s.replace(/(`+).+?\1/g, ' ')));
}

/** The inventory of one page: its sections in order, its code blocks, its anchors and its limit candidates. */
export function inventoryOf(file: string, markdown: string): FileInventory {
  // A figure `quality:baseline` writes into a README (`<!-- metric:tests -->3018<!-- /metric -->`) is generated, not
  // written: it is masked, so adding a test does not move a section of the frozen pages.
  const source = markdown.replace(/\r\n?/g, '\n').replace(METRIC, '$1…$2');
  const lines = source.split('\n');
  const headings: { line: number; level: number; text: string }[] = [];
  const explicit: { anchor: string; line: number }[] = [];
  const prose = new Map<number, string>();
  const fences: CodeBlock[] = [];
  mapLines(
    source,
    (raw, n) => {
      for (const m of raw.matchAll(EXPLICIT)) explicit.push({ anchor: m[1]!, line: n });
      const h = HEADING.exec(raw);
      if (h) headings.push({ line: n, level: h[1]!.length, text: headingText(h[2] ?? '') });
      else prose.set(n, raw);
      return raw;
    },
    (f) => fences.push({ hash: sha256(f.content), lang: f.lang, line: f.line }),
  );
  const slug = slugger();
  const starts = [
    ...(lines.slice(0, (headings[0]?.line ?? lines.length + 1) - 1).some((l) => l.trim())
      ? [{ line: 1, level: 0, text: '' }]
      : []),
    ...headings,
  ];
  const sections = starts.map((h, i): Section => {
    const anchor = h.level ? slug(h.text) : '';
    let end = (starts[i + 1]?.line ?? lines.length + 1) - 1;
    while (end > h.line && !lines[end - 1]!.trim()) end--;
    const body = lines.slice(h.line - 1, end).map((l) => l.trimEnd());
    // Prose is cut into chunks at a blank line, a fence, a list item, a table row or a quote.
    const chunks: string[] = [];
    let chunk: string[] = [];
    for (let n = h.line + (h.level ? 1 : 0); n <= end; n++) {
      const line = prose.get(n);
      const starter = line !== undefined && /^\s*([-*+]\s|\d+[.)]\s|\||>)/.test(line);
      if (line === undefined || !line.trim() || starter) {
        if (chunk.length) chunks.push(chunk.join(' '));
        chunk = [];
      }
      if (line?.trim()) chunk.push(line.replace(/^\s*([-*+]\s|\d+[.)]\s|>\s?)/, ''));
    }
    if (chunk.length) chunks.push(chunk.join(' '));
    return {
      key: keyOf(file, anchor),
      file,
      heading: h.text,
      level: h.level,
      anchor,
      lines: [h.line, end],
      hash: sha256(body.join('\n')),
      codeBlocks: fences.filter((f) => f.line >= h.line && f.line <= end),
      anchors: explicit.filter((a) => a.line >= h.line && a.line <= end).map((a) => a.anchor),
      limits: [...new Set(chunks.flatMap(limitCandidates))],
    };
  });
  return {
    file,
    sections,
    anchors: [...new Set([...sections.filter((s) => s.level).map((s) => s.anchor), ...explicit.map((a) => a.anchor)])],
  };
}

export const inventory = (root = ROOT): FileInventory[] =>
  inventoryFiles(root).map((f) => inventoryOf(f, readFileSync(resolve(root, f), 'utf8')));

// ——— Incoming anchored links (the cross-check) ———

export interface IncomingLink {
  from: string;
  line: number;
  target: string;
  anchor: string;
}

/**
 * A path with an anchor, written in a file: `docs/en/TOOLS.md#deploying`, `../en/ENGINE.md#bootstrap`; a full stop or a
 * colon right after it ends the sentence, not the anchor.
 */
const ANCHORED_PATH = /(?<![\w./-])((?:\.{1,2}\/)*(?:[\w.-]+\/)*[\w.-]+\.md)#([^\s)"'`<>\]|,;*]*[^\s)"'`<>\]|,;*.:])/g;
/** The same on GitHub, on the branch: what a reader of `main` lands on. */
const BLOB_MAIN =
  /github\.com\/wanoo\/(?:quest-n-click|web-scumm)\/blob\/main\/([\w./-]+\.md)#([^\s)"'`<>\]|,;*]*[^\s)"'`<>\]|,;*.:])/g;
const SCANNED = /\.(md|ts|mjs|json|ya?ml)$/;
/**
 * Never scanned: the matrix and what it generates (the legacy order, the manifest's `replaces`), which hold every
 * anchor of the inventory by construction, and the tests' fixture pages.
 */
const NOT_SCANNED = /^(wiki\/(coverage|legacy|manifest)\.json$|tests\/fixtures\/wiki\/)/;

const decode = (anchor: string) => {
  try {
    return decodeURIComponent(anchor).toLowerCase();
  } catch {
    return anchor.toLowerCase();
  }
};

/**
 * Every anchored link of the tracked files that points at an inventoried page: Markdown links read relative to their
 * file (with the one link scanner, so never inside code), and paths written in code or text, read from the root
 * unless they start with `./` or `../`.
 */
export function incomingLinks(root: string, tracked: readonly string[], targets: ReadonlySet<string>): IncomingLink[] {
  const out = new Map<string, IncomingLink>();
  const add = (from: string, line: number, path: string | undefined, anchor: string) => {
    if (!path || !targets.has(path) || !anchor) return;
    out.set(`${from}|${line}|${path}|${anchor}`, { from, line, target: path, anchor });
  };
  const resolvePath = (from: string, path: string, relative: boolean) => {
    const p = relative || /^\.{1,2}\//.test(path) ? posix.join(posix.dirname(from), path) : posix.normalize(path);
    return p.startsWith('..') ? undefined : p;
  };
  const scanText = (from: string, line: number, text: string) => {
    for (const m of text.matchAll(ANCHORED_PATH)) add(from, line, resolvePath(from, m[1]!, false), m[2]!);
    for (const m of text.matchAll(BLOB_MAIN)) add(from, line, posix.normalize(m[1]!), m[2]!);
  };
  for (const file of tracked) {
    if (!SCANNED.test(file) || NOT_SCANNED.test(file)) continue;
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (!file.endsWith('.md')) {
      text.split('\n').forEach((l, i) => {
        scanText(file, i + 1, l);
      });
      continue;
    }
    mapLines(
      text,
      (raw, n) => {
        // Markdown links: relative to the file, `#x` being the file itself; the rest of the line read as text.
        const rest = mapLine(raw, n, (l) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(l.target)) {
            scanText(file, n, l.target);
            return l.label;
          }
          const hash = l.target.indexOf('#');
          if (hash >= 0) {
            const rel = l.target.slice(0, hash);
            add(file, n, rel ? resolvePath(file, rel, true) : file, l.target.slice(hash + 1));
          }
          return l.label;
        });
        scanText(file, n, rest);
        return raw;
      },
      (f) => {
        f.content.split('\n').forEach((l, i) => {
          scanText(file, f.line + 1 + i, l);
        });
      },
    );
  }
  return [...out.values()];
}

/** The incoming anchored links whose anchor the inventory does not hold (some were broken before 4.5: listed). */
export function unresolvedLinks(files: readonly FileInventory[], links: readonly IncomingLink[]): IncomingLink[] {
  const anchors = new Map(files.map((f) => [f.file, new Set(f.anchors.map((a) => a.toLowerCase()))]));
  return links.filter((l) => !anchors.get(l.target)?.has(decode(l.anchor)));
}

// ——— The matrix ———

const DESTINATION = /^([a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*)(?:#([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const line = z.number().int().positive();
const unique = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((a) => new Set(a).size === a.length, { message: 'no item twice' });

const RowSchema = z
  .object({
    key: z.string().min(1),
    file: z.string().min(1),
    heading: z.string(),
    level: z.number().int().min(0).max(6),
    anchor: z.string(),
    lines: z.tuple([line, line]),
    hash,
    codeBlocks: z.array(z.object({ hash, lang: z.string(), line }).strict()),
    anchors: z.array(z.string().min(1)),
    /** Where the section goes, `id` or `id#section`, the section id in kebab case (many to many). */
    destinations: unique(z.string().regex(DESTINATION, 'a destination id or id#section (create.rooms#walk-zones)')),
    decision: z.enum(['keep', 'rewrite', 'drop']).nullable(),
    /** Why, for a drop (required); a note for a rewrite. */
    reason: z.string().trim().min(1).nullable(),
    /** The destination of the section's examples when it is not its first destination. */
    examples: unique(z.string().min(1)),
    /** The check that will hold the migrated text true (§4.4.3), once known. */
    verification: z.string().trim().min(1).nullable(),
    /** The destination is decided. */
    planned: z.boolean(),
    /** The content is in a `ready` page and was reviewed. */
    migrated: z.boolean(),
    limits: z.array(
      z.object({ text: z.string().min(1), status: z.enum(['pending', 'reported', 'not-a-limit']) }).strict(),
    ),
    /** Set by a merge: the section is new, its text changed, or it left its page. A person clears it once carried. */
    flag: z.enum(['added', 'changed', 'removed']).optional(),
  })
  .strict();
export type CoverageRow = z.infer<typeof RowSchema>;

const CoverageSchema = z
  .object({ format: z.literal(COVERAGE_FORMAT), version: z.literal(1), rows: z.array(RowSchema) })
  .strict()
  .superRefine((c, ctx) => {
    const keys = new Set<string>();
    c.rows.forEach((r, i) => {
      if (keys.has(r.key))
        ctx.addIssue({ code: 'custom', message: `the key ${r.key} is given twice`, path: ['rows', i] });
      keys.add(r.key);
    });
  });
export type Coverage = z.infer<typeof CoverageSchema>;

export const coveragePath = (wikiDir: string) => resolve(wikiDir, 'coverage.json');
const legacyPath = (wikiDir: string) => resolve(wikiDir, 'legacy.json');

export function readCoverage(
  wikiDir: string,
): { coverage: Coverage; errors: [] } | { coverage?: never; errors: string[]; missing?: boolean } {
  const file = coveragePath(wikiDir);
  if (!existsSync(file))
    return { errors: [`coverage.json is missing: run \`${COVERAGE_COMMAND} --init\``], missing: true };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: [`coverage.json: ${(e as Error).message}`] };
  }
  const parsed = CoverageSchema.safeParse(raw);
  if (!parsed.success) return { errors: issuesOf(parsed.error).map((l) => `coverage.json ${l}`) };
  return { coverage: parsed.data, errors: [] };
}

const freshRow = (s: Section, flag?: CoverageRow['flag']): CoverageRow => ({
  key: s.key,
  file: s.file,
  heading: s.heading,
  level: s.level,
  anchor: s.anchor,
  lines: s.lines,
  hash: s.hash,
  codeBlocks: s.codeBlocks,
  anchors: s.anchors,
  destinations: [],
  decision: null,
  reason: null,
  examples: [],
  verification: null,
  planned: false,
  migrated: false,
  limits: s.limits.map((text) => ({ text, status: 'pending' as const })),
  ...(flag ? { flag } : {}),
});

/** The matrix made from an inventory, nothing decided yet (`coverage --init`). */
export const initCoverage = (files: readonly FileInventory[]): Coverage => ({
  format: COVERAGE_FORMAT,
  version: 1,
  rows: files.flatMap((f) => f.sections.map((s) => freshRow(s))),
});

export interface MergeReport {
  added: string[];
  changed: string[];
  removed: string[];
}

/**
 * A new inventory merged into the matrix (`coverage`): what a person wrote is kept; a new section is added (`added`); a
 * section whose text changed is `changed` and no longer `migrated`; a section that left its page stays, `removed`, at
 * the end, until a person deletes its row. A limit candidate keeps its status while its sentence is unchanged.
 */
export function mergeCoverage(
  previous: Coverage,
  files: readonly FileInventory[],
): { coverage: Coverage } & MergeReport {
  const old = new Map(previous.rows.map((r) => [r.key, r]));
  const report: MergeReport = { added: [], changed: [], removed: [] };
  const rows: CoverageRow[] = [];
  for (const s of files.flatMap((f) => f.sections)) {
    const r = old.get(s.key);
    old.delete(s.key);
    if (!r) {
      report.added.push(s.key);
      rows.push(freshRow(s, 'added'));
      continue;
    }
    const changed = r.hash !== s.hash || r.flag === 'removed';
    if (changed) report.changed.push(s.key);
    const status = new Map(r.limits.map((l) => [l.text, l.status]));
    const { flag: _flag, ...kept } = r;
    const flag = changed ? 'changed' : r.flag;
    rows.push({
      ...kept,
      heading: s.heading,
      level: s.level,
      lines: s.lines,
      hash: s.hash,
      codeBlocks: s.codeBlocks,
      anchors: s.anchors,
      migrated: changed ? false : r.migrated,
      limits: s.limits.map((text) => ({ text, status: status.get(text) ?? 'pending' })),
      ...(flag ? { flag } : {}),
    });
  }
  for (const r of old.values()) {
    if (r.flag !== 'removed') report.removed.push(r.key);
    rows.push({ ...r, flag: 'removed' });
  }
  return { coverage: { ...previous, rows }, ...report };
}

/** What makes the matrix out of step with the pages: a new, changed or vanished section. Empty when in sync. */
export function staleRows(coverage: Coverage, files: readonly FileInventory[]): string[] {
  const rows = new Map(coverage.rows.map((r) => [r.key, r]));
  const out: string[] = [];
  const seen = new Set<string>();
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const s of files.flatMap((f) => f.sections)) {
    seen.add(s.key);
    const r = rows.get(s.key);
    if (!r || r.flag === 'removed') out.push(`${s.key}: a section the matrix does not hold`);
    else if (r.hash !== s.hash) out.push(`${s.key}: its text changed`);
    else if (
      !same(r.lines, s.lines) ||
      r.heading !== s.heading ||
      r.level !== s.level ||
      !same(r.codeBlocks, s.codeBlocks) ||
      !same(r.anchors, s.anchors) ||
      !same(
        r.limits.map((l) => l.text),
        s.limits,
      )
    )
      out.push(`${s.key}: moved in its page (lines, code blocks, anchors or limit candidates)`);
  }
  for (const r of coverage.rows)
    if (!seen.has(r.key) && r.flag !== 'removed') out.push(`${r.key}: no longer in ${r.file}`);
  return out;
}

const live = (c: Coverage) => c.rows.filter((r) => r.flag !== 'removed');
const destinationId = (d: string) => d.split('#')[0]!;

// ——— What the matrix generates: the legacy order and the manifest's `replaces` ———

export interface Legacy {
  format: typeof LEGACY_FORMAT;
  version: 1;
  /** For each `read_doc {name}`, the `id#section` that rebuild it, in the order of its old sections, each once. */
  pages: Record<string, string[]>;
}

export function legacyOf(coverage: Coverage): Legacy {
  const pages: Record<string, string[]> = {};
  for (const name of DOCS)
    pages[name] = [
      ...new Set(
        live(coverage)
          .filter((r) => r.file === `docs/en/${name}.md` && r.decision !== 'drop')
          .flatMap((r) => r.destinations),
      ),
    ];
  return { format: LEGACY_FORMAT, version: 1, pages };
}

/** Each manifest page's `replaces`: the old `file#anchor` whose destinations name it, in the matrix's order. */
function replacesOf(coverage: Coverage, manifest: Manifest): Map<string, string[]> {
  const out = new Map(manifest.pages.map((p) => [p.id, [] as string[]]));
  for (const r of live(coverage)) {
    if (r.decision === 'drop') continue;
    for (const id of new Set(r.destinations.map(destinationId))) out.get(id)?.push(r.key);
  }
  return out;
}

/**
 * The manifest's text with each page's `replaces` set, every other byte kept: the manifest is written by hand, so it
 * is edited in place rather than rewritten. The result is parsed back and compared, so a surprise in the layout fails
 * loudly instead of corrupting the file.
 */
export function withReplaces(manifestText: string, replaces: ReadonlyMap<string, readonly string[]>): string {
  const lines = manifestText.split('\n');
  const out: string[] = [];
  let id: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const idLine = /^ {6}"id": "([^"]+)",$/.exec(l);
    if (idLine) id = idLine[1];
    const m = /^( {6})"replaces": (.*)$/.exec(l);
    if (!m || !id) {
      out.push(l);
      continue;
    }
    let end = i;
    if (!/^\[.*\],?$/.test(m[2]!)) while (end < lines.length && !/^ {6}\],?$/.test(lines[end]!)) end++;
    const comma = lines[end]!.endsWith(',') ? ',' : '';
    const items = replaces.get(id) ?? [];
    const inline = `${m[1]}"replaces": [${items.map((x) => JSON.stringify(x)).join(', ')}]${comma}`;
    if (inline.length <= 120 || !items.length) out.push(inline);
    else
      out.push(
        `${m[1]}"replaces": [`,
        ...items.map((x, k) => `${m[1]}  ${JSON.stringify(x)}${k < items.length - 1 ? ',' : ''}`),
        `${m[1]}]${comma}`,
      );
    i = end;
  }
  const text = out.join('\n');
  const expected = JSON.parse(manifestText) as Manifest;
  for (const p of expected.pages) p.replaces = [...(replaces.get(p.id) ?? [])];
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected))
    throw new Error('manifest.json: its layout is not the one expected, `replaces` could not be set in place');
  return text;
}

// ——— The counters ———

interface Counter {
  total: number;
  planned: number;
  migrated: number;
}
export interface Counters {
  sections: Counter;
  codeBlocks: Counter;
  limits: Counter;
}

/**
 * "destinations planned" and "migrated and reviewed" (§4.2), for the sections, their code blocks and their limit
 * candidates. A limit candidate counts as migrated once its row is and a person ticked it (`reported` or
 * `not-a-limit`).
 */
export function coverageCounters(coverage: Coverage): Counters {
  const rows = live(coverage);
  const sum = (of: (r: CoverageRow) => number, keep: (r: CoverageRow) => boolean = () => true) =>
    rows.filter(keep).reduce((n, r) => n + of(r), 0);
  return {
    sections: {
      total: rows.length,
      planned: rows.filter((r) => r.planned).length,
      migrated: rows.filter((r) => r.migrated).length,
    },
    codeBlocks: {
      total: sum((r) => r.codeBlocks.length),
      planned: sum(
        (r) => r.codeBlocks.length,
        (r) => r.planned,
      ),
      migrated: sum(
        (r) => r.codeBlocks.length,
        (r) => r.migrated,
      ),
    },
    limits: {
      total: sum((r) => r.limits.length),
      planned: sum(
        (r) => r.limits.length,
        (r) => r.planned,
      ),
      migrated: sum(
        (r) => r.limits.filter((l) => l.status !== 'pending').length,
        (r) => r.migrated,
      ),
    },
  };
}

/** A share, rounded down: 99.96 % is not 100 %. */
const percent = (n: number, total: number) => (total ? `${Math.floor((1000 * n) / total) / 10}%` : '100%');

/** The two lines of §4.2, always shown together. */
export function counterLines(c: Counters): string[] {
  const part = (k: 'planned' | 'migrated') =>
    (
      [
        ['sections', c.sections],
        ['code blocks', c.codeBlocks],
        ['limit candidates', c.limits],
      ] as const
    )
      .map(([name, x]) => `${name} ${percent(x[k], x.total)} (${x[k]}/${x.total})`)
      .join(' · ');
  return [`destinations planned: ${part('planned')}`, `migrated and reviewed: ${part('migrated')}`];
}

// ——— Writing, and checking ———

/** Writes the matrix and what it generates: `legacy.json`, and the manifest's `replaces` when a manifest is given. */
export function writeCoverage(wikiDir: string, coverage: Coverage, manifest?: Manifest): void {
  writeFileSync(coveragePath(wikiDir), formatJson(coverage));
  writeFileSync(legacyPath(wikiDir), formatJson(legacyOf(coverage)));
  if (manifest) {
    const file = resolve(wikiDir, 'manifest.json');
    const text = readFileSync(file, 'utf8');
    const next = withReplaces(text, replacesOf(coverage, manifest));
    if (next !== text) writeFileSync(file, next);
  }
}

export interface CoverageReport {
  errors: string[];
  warnings: string[];
  gaps: string[];
  counters?: Counters;
  unresolved: IncomingLink[];
}

export interface CoverageCheckOptions {
  wikiDir: string;
  /** The repository whose pages are inventoried and whose tracked files are scanned for incoming links. */
  root: string;
  manifest: Manifest;
  tracked: readonly string[];
}

/**
 * The matrix at the work level (§4.1): its schema; destinations that are manifest pages (and, on a written page, one
 * of its sections); a decision for every planned row, a reason for every drop; every code block of the pages held by a
 * row; the matrix in step with the pages (otherwise `docs/` changed behind its back: the freeze); `legacy.json` and the
 * manifest's `replaces` as the matrix makes them. Rows without a decision, flagged rows and incoming anchored links
 * that resolve to nothing are listed, not refused.
 */
export function checkCoverage({ wikiDir, root, manifest, tracked }: CoverageCheckOptions): CoverageReport {
  const report: CoverageReport = { errors: [], warnings: [], gaps: [], unresolved: [] };
  const read = readCoverage(wikiDir);
  if (!read.coverage) {
    report.errors.push(...read.errors);
    return report;
  }
  const { coverage } = read;
  report.counters = coverageCounters(coverage);
  const pages = new Map(manifest.pages.map((p) => [p.id, p]));
  const sectionsOf = new Map<string, string[] | undefined>();
  const sections = (id: string) => {
    if (!sectionsOf.has(id)) {
      const p = pages.get(id)!;
      const file = resolve(wikiDir, 'en', `${id}.md`);
      sectionsOf.set(
        id,
        p.state !== 'planned' && !p.generated && existsSync(file)
          ? parsePage(readFileSync(file, 'utf8'), 'en').sections
          : undefined,
      );
    }
    return sectionsOf.get(id);
  };
  const undecided: string[] = [];
  for (const r of coverage.rows) {
    for (const d of r.destinations) {
      const [id, section] = d.split('#') as [string, string | undefined];
      if (!PAGE_ID.test(id) || !pages.has(id)) {
        report.errors.push(`coverage.json ${r.key}: the destination ${d} is not a manifest page`);
        continue;
      }
      const known = section ? sections(id) : undefined;
      if (section && known && !known.includes(section))
        report.errors.push(`coverage.json ${r.key}: ${d} is not a section of ${id}`);
    }
    if (r.flag === 'removed') {
      report.warnings.push(`coverage.json ${r.key}: left its page; delete the row once its content is accounted for`);
      continue;
    }
    if (r.decision === 'drop' && !r.reason) report.errors.push(`coverage.json ${r.key}: a drop says why (reason)`);
    if (r.planned && !r.decision) report.errors.push(`coverage.json ${r.key}: planned, yet no decision`);
    if (r.planned && r.decision !== 'drop' && !r.destinations.length)
      report.errors.push(`coverage.json ${r.key}: planned to ${r.decision}, yet no destination`);
    if (r.migrated && !r.planned) report.errors.push(`coverage.json ${r.key}: migrated, yet not planned`);
    if (!r.decision) undecided.push(r.key);
    if (r.flag)
      report.warnings.push(
        `coverage.json ${r.key}: ${r.flag === 'added' ? 'a new section' : 'its text changed'} since the matrix was made; carry it into its wiki pages, then remove its flag`,
      );
  }
  if (undecided.length)
    report.gaps.push(
      `${undecided.length} section(s) of the old documentation have no decision yet: ${undecided.slice(0, 10).join(', ')}${undecided.length > 10 ? '…' : ''}`,
    );

  const files = inventory(root);
  const held = new Set(coverage.rows.flatMap((r) => r.codeBlocks.map((b) => b.hash)));
  for (const s of files.flatMap((f) => f.sections))
    for (const b of s.codeBlocks)
      if (!held.has(b.hash))
        report.errors.push(`coverage.json: the code block of ${s.file} line ${b.line} is in no row`);
  const stale = staleRows(coverage, files);
  if (stale.length) {
    for (const s of stale) report.errors.push(`coverage.json is out of step with the pages: ${s}`);
    report.errors.push(
      `docs/ is frozen (PLAN-4.5-WIKI §4.2): run \`${COVERAGE_COMMAND}\`, then carry the change into the wiki pages`,
    );
  }
  const legacy = legacyPath(wikiDir);
  if (!existsSync(legacy) || readFileSync(legacy, 'utf8') !== formatJson(legacyOf(coverage)))
    report.errors.push(`legacy.json is not the one the matrix makes: run \`${COVERAGE_COMMAND}\``);
  const replaces = replacesOf(coverage, manifest);
  const drift = manifest.pages.filter((p) => JSON.stringify(p.replaces) !== JSON.stringify(replaces.get(p.id) ?? []));
  if (drift.length)
    report.errors.push(
      `manifest.json: the replaces of ${drift.map((p) => p.id).join(', ')} are not the matrix's: run \`${COVERAGE_COMMAND}\``,
    );

  const targets = new Set(files.map((f) => f.file));
  report.unresolved = unresolvedLinks(files, incomingLinks(root, tracked, targets));
  for (const l of report.unresolved)
    report.warnings.push(
      `${l.from} line ${l.line}: links to ${l.target}#${l.anchor}, an anchor the page does not have`,
    );
  return report;
}
