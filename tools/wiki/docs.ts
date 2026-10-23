// The documentation as the tools read it (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3, L3; ADR 0030): one in-memory
// set, whatever it was loaded from, and the three readings MCP and the Studio's Assistant make of it: `search_docs`,
// `list_docs` and `read_doc` by id. A set is an index (the format `quest-n-click-docs-index` v1 a bundle carries as
// `index.json`), the pages' Markdown by `<lang>/<id>`, and its provenance: what it was built from (product version and
// commit, doc revision, build), never whether it was published, which is recorded outside it (§4.5.1). It is loaded by
// tools/wiki/docs-load.ts from a package's `docs-bundle/` or from the repository's `wiki/` (a preview), and embedded
// as is in the demo Studio's snapshot. No node import here: the Studio page bundles it with tools/studio/tools.ts.
//
// The search is deterministic: the same set and the same request give the same results, in the same order, with the
// same scores. A word matches when it is the same once accents, case and a plural `s` are set aside; the glossary's
// French and English words and synonyms widen a query (« verrou » also looks for "lease"). Weights: a page's title or
// one of its questions, then its aliases, keywords and identifiers, then a section's heading, then a section's body.
// Under a confidence threshold the answer is an explicit empty result, never weak results dressed as relevant.
import { mapLines } from './page';

export const INDEX_FORMAT = 'quest-n-click-docs-index';
export const BUNDLE_FORMAT = 'quest-n-click-docs-bundle';
export type DocsLang = 'en' | 'fr';
const LANGS: readonly DocsLang[] = ['en', 'fr'];
type Bilingual<T> = Record<DocsLang, T>;

interface IndexSection {
  /** The section's `<a name>` id; '' for what comes before the first one (the page's title and its lead). */
  id: string;
  title: string;
  sha256: string;
}
export interface IndexPage {
  id: string;
  domain: string;
  type: string;
  alsoTypes?: string[];
  audience: string[];
  context: string[];
  versions?: { appliesFrom: string; appliesUntil?: string; featureSince?: string };
  /** Never `planned`: a page without a file is not in an index. A bundle holds `ready` pages only. */
  state: 'draft' | 'ready';
  title: Bilingual<string>;
  url: Bilingual<string>;
  questions: Bilingual<string[]>;
  aliases: Bilingual<string[]>;
  keywords: Bilingual<string[]>;
  identifiers: string[];
  /** Each written language: its file in the set, the file's hash, its sections. */
  langs: Partial<Record<DocsLang, { file: string; sha256: string; sections: IndexSection[] }>>;
}
interface GlossarySide {
  term: string;
  synonyms: string[];
}
export interface DocsIndex {
  format: typeof INDEX_FORMAT;
  version: 1;
  pages: IndexPage[];
  /** The bilingual glossary's words (wiki/data/glossary.json), which widen a search. */
  glossary: { id: string; en: GlossarySide; fr: GlossarySide; pages: string[] }[];
  /** wiki/legacy.json: for each of the eight `read_doc` names, the ordered `id#section` that rebuild it (§4.2). */
  legacy: Record<string, string[]>;
}

/** What a set of pages is: its identity only (§4.5.1). Whether it was promoted to a release is not in it. */
export interface Provenance {
  source: 'bundle' | 'repository';
  productVersion: string;
  productCommit: string;
  docRevision: string;
  buildId?: string;
  /** The same in words, for a reader: "repository preview", or the bundle's build and where promotion is recorded. */
  label: string;
}

export interface DocsSet {
  provenance: Provenance;
  index: DocsIndex;
  /** Each page's Markdown, by `<lang>/<id>`. */
  pages: Record<string, string>;
}

/**
 * Why a file of the given format cannot be read, or undefined: an unknown format, or a version this engine does not
 * know (a newer major), refused with a plain message rather than half read.
 */
export function formatProblem(raw: unknown, format: string, label: string): string | undefined {
  const o = raw as { format?: unknown; version?: unknown } | null;
  if (!o || typeof o !== 'object' || o.format !== format) return `${label} is not a ${format} file`;
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1)
    return `${label} has no format version`;
  if (o.version !== 1)
    return `${label} is format version ${o.version}; this engine reads version 1 only: install a newer quest-n-click to read it`;
  return undefined;
}

// ------------------------------------------------------------------------------------------------- sections

export interface Section {
  id: string;
  title: string;
  /** The section's Markdown as written, its anchor line and heading included. */
  text: string;
}

const ANCHOR = /^<a (?:name|id)="([a-z0-9]+(?:-[a-z0-9]+)*)"><\/a>\s*$/;
const headingOf = (line: string | undefined) => (line ?? '').replace(/^#{1,6}\s+/, '').trim();

/**
 * A page cut at its `<a name>` anchors (outside fenced code): the lead before the first anchor (id '', kept when it
 * holds more than blank lines), then one section per anchor, up to the next.
 */
export function splitSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const anchors: { id: string; line: number }[] = [];
  mapLines(markdown, (raw, n) => {
    const id = ANCHOR.exec(raw.trim())?.[1];
    if (id) anchors.push({ id, line: n - 1 });
    return raw;
  });
  const out: Section[] = [];
  const lead = lines.slice(0, anchors[0]?.line ?? lines.length);
  if (lead.some((l) => l.trim()))
    out.push({ id: '', title: headingOf(lead.find((l) => /^#\s/.test(l))), text: lead.join('\n').trim() });
  anchors.forEach((a, i) => {
    const body = lines.slice(a.line, anchors[i + 1]?.line ?? lines.length);
    out.push({ id: a.id, title: headingOf(body.slice(1).find((l) => l.trim())), text: body.join('\n').trim() });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------- words

const STOP = new Set(
  (
    'a an the of to in on at by for from and or is are be do does did how i my me we you your it its this that these ' +
    'what why where when which who with can could should would not no if as into get use using want ' +
    'le la les l un une des de du d et ou est sont etre pour dans sur en au aux ce cet cette ces que qui quoi quel ' +
    'quelle comment pourquoi je j mon ma mes il elle on ne n se s sa son ses par avec plus y a veux faire'
  ).split(' '),
);
/** Lowercase, accents removed, anything but letters and digits a space. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** A plural `s` set aside, so "zones" meets "zone" (French and English alike). */
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** The words of a text as compared: folded, stemmed; with `all`, the stop words kept (a phrase is compared whole). */
const words = (s: string, all = false): string[] =>
  fold(s)
    .split(' ')
    .filter((w) => w && (all || (!STOP.has(w) && (w.length > 1 || /\d/.test(w)))))
    .map(stem);
const phrase = (s: string) => ` ${words(s, true).join(' ')} `;

// ------------------------------------------------------------------------------------------------- versions

const semver = (v: string) => {
  const [core = '', pre] = v.split('-', 2);
  const n = core.split('.').map((x) => Number(x) || 0);
  return { n: [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0], pre };
};
/** -1, 0 or 1, SemVer's order (a pre-release before its release). */
function compareVersions(a: string, b: string): number {
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i]! < y.n[i]! ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}
/** Whether what a page describes is true for `version` (§4.4.1: `appliesFrom`, and `appliesUntil` inclusive). */
const applies = (p: IndexPage, version: string) =>
  !p.versions ||
  (compareVersions(version, p.versions.appliesFrom) >= 0 &&
    (!p.versions.appliesUntil || compareVersions(version, p.versions.appliesUntil) <= 0));

// ------------------------------------------------------------------------------------------------- cursors

/** A short, stable hash (FNV-1a, 32 bits, hex): a request's fingerprint, not a security measure. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
/** The set's revision as a cursor holds it: the doc revision and the hash of every file it holds. */
const revisionOf = (set: DocsSet) =>
  `${set.provenance.docRevision}:${fnv(
    set.index.pages.flatMap((p) => LANGS.map((l) => `${p.id}/${l}/${p.langs[l]?.sha256 ?? ''}`)).join('|'),
  )}`;
/** The request a cursor continues, without its cursor, its keys in a fixed order. */
const requestHash = (r: Record<string, unknown>) =>
  fnv(
    JSON.stringify(
      Object.keys(r)
        .filter((k) => k !== 'cursor' && r[k] !== undefined)
        .sort()
        .map((k) => [k, r[k]]),
    ),
  );

interface CursorData {
  r: string;
  l: string;
  q: string;
  o: number;
}
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const encodeCursor = (c: CursorData) => `c1.${b64url(JSON.stringify(c))}`;

/** Thrown for a cursor that does not continue this request on this documentation. */
export class StaleCursor extends Error {
  readonly code = 'stale_cursor';
  constructor(why: string) {
    super(`stale_cursor: ${why}; run the request again without its cursor`);
  }
}
/** The offset a cursor holds, once checked against the set's revision, the language and the request. */
function cursorOffset(cursor: string, set: DocsSet, lang: string, request: Record<string, unknown>): number {
  let c: CursorData;
  try {
    if (!cursor.startsWith('c1.')) throw new Error();
    c = JSON.parse(unb64url(cursor.slice(3))) as CursorData;
    if (typeof c.o !== 'number' || !Number.isInteger(c.o) || c.o < 0) throw new Error();
  } catch {
    throw new StaleCursor('this is not a cursor this tool gave');
  }
  if (c.r !== revisionOf(set)) throw new StaleCursor('the documentation changed since this cursor was given');
  if (c.l !== lang || c.q !== requestHash(request))
    throw new StaleCursor('this cursor was given for another request (id, section, language, query or filters)');
  return c.o;
}

// ------------------------------------------------------------------------------------------------- search

type MatchReason = 'title' | 'question' | 'alias' | 'identifier' | 'section' | 'body';
const WEIGHT: Record<MatchReason, number> = { title: 10, question: 10, alias: 6, identifier: 6, section: 4, body: 2 };
/** A glossary word found in the query widens it; each word it adds weighs this much of a word typed. */
const EXPANSION = 0.6;
/** Under this score, or with fewer than half the words typed found, a result is not confident. */
const THRESHOLD = 3;
const MIN_COVERAGE = 0.5;

export interface SearchInput {
  query: string;
  lang?: DocsLang;
  audience?: string;
  context?: string;
  version?: string;
  type?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}
interface SearchResult {
  /** `id#section`, or `id` for a page's lead. */
  ref: string;
  id: string;
  section: string;
  lang: DocsLang;
  title: string;
  sectionTitle: string;
  type: string;
  context: string[];
  versions?: IndexPage['versions'];
  state: IndexPage['state'];
  /** `current` until A5 brings `deprecated` and `archived` (shown only with `includeArchived`). */
  status: 'current' | 'deprecated' | 'archived';
  /** With `includeArchived` and `version`: the page does not apply to that version. */
  notApplicable?: true;
  score: number;
  reason: MatchReason;
  /** The text around the words found, each marked **like this**. */
  snippet: string;
}
export type SearchOutput =
  | { query: string; results: SearchResult[]; total: number; cursor?: string; provenance: Provenance }
  | { query: string; results: []; note: 'no confident match'; suggestions: string[]; provenance: Provenance };

const typesOf = (p: IndexPage) => [p.type, ...(p.alsoTypes ?? [])];
/** The pages a request's filters keep (the version filter is applied by the caller: it may mark rather than drop). */
const filtered = (set: DocsSet, f: { audience?: string; context?: string; type?: string; state?: string }) =>
  set.index.pages.filter(
    (p) =>
      (!f.audience || p.audience.includes(f.audience)) &&
      (!f.context || p.context.includes(f.context)) &&
      (!f.type || typesOf(p).includes(f.type)) &&
      (!f.state || p.state === f.state),
  );

interface Term {
  word: string;
  weight: number;
  /** The words typed this one stands for (a glossary word stands for the words that found it). */
  covers: string[];
}

/**
 * The query's words, then the glossary's words its phrases name, in both languages; and, for each page a named term
 * points at, the term's words as more aliases of that page.
 */
function termsOf(query: string, set: DocsSet): { terms: Term[]; aliases: Map<string, Bilingual<string[]>> } {
  const typed = [...new Set(words(query))];
  const terms: Term[] = typed.map((w) => ({ word: w, weight: 1, covers: [w] }));
  const aliases = new Map<string, Bilingual<string[]>>();
  const q = phrase(query);
  for (const g of set.index.glossary) {
    const names = LANGS.flatMap((l) => [g[l].term, ...g[l].synonyms]);
    const hit = names.find((n) => words(n, true).length && q.includes(phrase(n)));
    if (!hit) continue;
    const covers = words(hit).filter((w) => typed.includes(w));
    for (const w of new Set(names.flatMap((n) => words(n))))
      if (!terms.some((t) => t.word === w)) terms.push({ word: w, weight: EXPANSION, covers });
    for (const id of g.pages) {
      const a = aliases.get(id) ?? { en: [], fr: [] };
      for (const l of LANGS) a[l].push(g[l].term, ...g[l].synonyms);
      aliases.set(id, a);
    }
  }
  return { terms, aliases };
}

/** Marks the words of `text` that are among `found`, around the first one, in at most about 160 characters. */
function snippetOf(text: string, found: ReadonlySet<string>): string {
  // Read as text: no anchor, no heading marks, a link or an image as its label.
  const flat = text
    .replace(/<a (?:name|id)="[^"]*"><\/a>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const spans = [...flat.matchAll(/[\p{L}\p{N}]+/gu)].filter((m) => {
    const w = words(m[0], true)[0];
    return w !== undefined && found.has(w);
  });
  const first = spans[0]?.index ?? 0;
  let start = Math.max(0, first - 60);
  if (start > 0) start = flat.lastIndexOf(' ', start) + 1;
  let end = Math.min(flat.length, start + 160);
  if (end < flat.length) {
    const space = flat.indexOf(' ', end);
    end = space < 0 ? flat.length : space;
  }
  let out = '';
  let at = start;
  for (const m of spans) {
    const i = m.index!;
    if (i < start || i + m[0].length > end) continue;
    out += `${flat.slice(at, i)}**${m[0]}**`;
    at = i + m[0].length;
  }
  out += flat.slice(at, end);
  return `${start > 0 ? '… ' : ''}${out}${end < flat.length ? ' …' : ''}`;
}

interface Scored extends SearchResult {
  order: number;
}

/** The best section of one page in one language, and its score; undefined when nothing of the query is in it. */
function scorePage(
  p: IndexPage,
  lang: DocsLang,
  markdown: string,
  terms: readonly Term[],
  query: string,
  glossary: readonly string[],
) {
  const typed = new Set(terms.filter((t) => t.weight === 1).map((t) => t.word));
  const q = phrase(query);
  // Page-level fields: the best one each word is found in.
  const fields: { reason: MatchReason; texts: string[] }[] = [
    { reason: 'title', texts: [p.title[lang]] },
    { reason: 'question', texts: p.questions[lang] },
    { reason: 'alias', texts: [...p.aliases[lang], ...p.keywords[lang], ...glossary] },
    { reason: 'identifier', texts: p.identifiers },
  ];
  const fieldWords = fields.map((f) => f.texts.map((t) => new Set(words(t))));
  const pageHits = terms.map((t) => {
    for (const [i, f] of fields.entries()) {
      const j = fieldWords[i]!.findIndex((s) => s.has(t.word));
      if (j >= 0) return { reason: f.reason, text: f.texts[j]!, score: WEIGHT[f.reason] * t.weight };
    }
    return undefined;
  });
  // A whole question, title or identifier typed: a strong sign, counted once more.
  let bonus = 0;
  let bonusHit: { reason: MatchReason; text: string } | undefined;
  for (const f of fields)
    for (const t of f.texts) {
      const ph = phrase(t);
      const whole =
        f.reason === 'identifier'
          ? ph.trim() !== '' && q.includes(ph)
          : words(query).length > 1 && ph.includes(phrase(query));
      if (whole && WEIGHT[f.reason] > bonus) {
        bonus = WEIGHT[f.reason];
        bonusHit = { reason: f.reason, text: t };
      }
    }
  let best: { section: Section; score: number; reason: MatchReason; text: string; found: Set<string> } | undefined;
  for (const s of splitSections(markdown)) {
    const title = new Set(words(s.title));
    // The body: the section's lines but its anchor and its heading.
    const lines = s.text.split('\n').filter((l) => !ANCHOR.test(l.trim()));
    const heading = lines.findIndex((l) => /^#{1,6}\s/.test(l));
    const counts = new Map<string, number>();
    for (const w of words(lines.filter((_, i) => i !== heading).join('\n'))) counts.set(w, (counts.get(w) ?? 0) + 1);
    let score = bonus;
    const found = new Set<string>();
    const covered = new Set<string>();
    let top: { reason: MatchReason; score: number; text: string } | undefined = bonusHit
      ? { ...bonusHit, score: bonus }
      : undefined;
    for (const [i, t] of terms.entries()) {
      const page = pageHits[i];
      const n = counts.get(t.word) ?? 0;
      const reason: MatchReason | undefined = title.has(t.word) ? 'section' : n ? 'body' : undefined;
      if (!page && !reason) continue;
      const sec =
        reason === 'section' ? WEIGHT.section * t.weight : n ? (WEIGHT.body + Math.min(n - 1, 2) * 0.5) * t.weight : 0;
      found.add(t.word);
      for (const c of t.covers) covered.add(c);
      score += (page?.score ?? 0) + sec;
      if (page && (!top || page.score > top.score)) top = { reason: page.reason, score: page.score, text: page.text };
      if (reason && (!top || sec > top.score)) top = { reason, score: sec, text: s.text };
    }
    if (!top) continue;
    const coverage = typed.size ? [...typed].filter((w) => covered.has(w)).length / typed.size : 0;
    const final = Math.round(score * (0.4 + 0.6 * coverage) * 100) / 100;
    if (final < THRESHOLD || coverage < MIN_COVERAGE) continue;
    if (!best || final > best.score) best = { section: s, score: final, reason: top.reason, text: top.text, found };
  }
  return best;
}

/** `search_docs`: one result per page, its best section, by score then id. */
export function searchDocs(set: DocsSet, input: SearchInput): SearchOutput {
  const limit = Math.min(Math.max(1, input.limit ?? 5), 20);
  const lang = input.lang;
  const request = { ...input, limit, includeArchived: !!input.includeArchived };
  const offset = input.cursor ? cursorOffset(input.cursor, set, lang ?? '*', request) : 0;
  const { terms, aliases } = termsOf(input.query, set);
  const scored: Scored[] = [];
  filtered(set, input).forEach((p, order) => {
    const notApplicable = input.version !== undefined && !applies(p, input.version);
    if (notApplicable && !input.includeArchived) return;
    let pick: Scored | undefined;
    for (const l of lang ? [lang] : LANGS) {
      const md = p.langs[l] ? set.pages[`${l}/${p.id}`] : undefined;
      if (md === undefined) continue;
      const b = scorePage(p, l, md, terms, input.query, aliases.get(p.id)?.[l] ?? []);
      if (!b || (pick && pick.score >= b.score)) continue;
      pick = {
        ref: b.section.id ? `${p.id}#${b.section.id}` : p.id,
        id: p.id,
        section: b.section.id,
        lang: l,
        title: p.title[l],
        sectionTitle: b.section.title,
        type: p.type,
        context: p.context,
        ...(p.versions ? { versions: p.versions } : {}),
        state: p.state,
        status: 'current',
        ...(notApplicable ? { notApplicable: true as const } : {}),
        score: b.score,
        reason: b.reason,
        snippet: snippetOf(b.text, b.found),
        order,
      };
    }
    if (pick) scored.push(pick);
  });
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!scored.length)
    return {
      query: input.query,
      results: [],
      note: 'no confident match',
      suggestions: set.index.pages.filter((p) => p.type === 'index').map((p) => p.id),
      provenance: set.provenance,
    };
  const page = scored.slice(offset, offset + limit).map(({ order: _o, ...r }) => r);
  const next = offset + limit;
  return {
    query: input.query,
    results: page,
    total: scored.length,
    ...(next < scored.length
      ? { cursor: encodeCursor({ r: revisionOf(set), l: lang ?? '*', q: requestHash(request), o: next }) }
      : {}),
    provenance: set.provenance,
  };
}

// ------------------------------------------------------------------------------------------------- list

export interface ListInput {
  audience?: string;
  context?: string;
  type?: string;
  lang?: DocsLang;
  state?: 'draft' | 'ready';
}
/** `list_docs`: the pages the set holds, in the manifest's order, with their sections. */
export function listDocs(set: DocsSet, input: ListInput) {
  const pages = filtered(set, input)
    .filter((p) => !input.lang || p.langs[input.lang])
    .map((p) => {
      const langs = LANGS.filter((l) => p.langs[l]);
      const l = input.lang ?? langs[0] ?? 'en';
      return {
        id: p.id,
        title: input.lang ? p.title[input.lang] : p.title,
        type: p.type,
        audience: p.audience,
        context: p.context,
        ...(p.versions ? { versions: p.versions } : {}),
        state: p.state,
        langs,
        sections: (p.langs[l]?.sections ?? []).map((s) => ({ id: s.id, title: s.title })),
      };
    });
  return { pages, total: pages.length, provenance: set.provenance };
}

// ------------------------------------------------------------------------------------------------- read

const READ_DEFAULT_CHARS = 20_000;
export const READ_MAX_CHARS = 100_000;

export interface ReadInput {
  id: string;
  section?: string;
  lang?: DocsLang;
  cursor?: string;
  maxChars?: number;
}

/** The header `read_doc` by id puts above the text: where it comes from, in one line. */
export function provenanceLine(p: Provenance, page?: { ref: string; lang: string; state: string }): string {
  const what = page
    ? `${page.ref} (${page.lang}, ${page.state === 'draft' ? 'draft: not reviewed yet' : 'ready'}) · `
    : '';
  const ids = [
    `commit ${p.productCommit.slice(0, 12)}`,
    `doc revision ${p.docRevision.slice(0, 12)}`,
    ...(p.buildId ? [`build ${p.buildId}`] : []),
  ];
  return `> quest'n'click documentation · ${what}quest'n'click ${p.productVersion} (${ids.join(', ')}) · ${p.label}`;
}

/** `read_doc {id, section?, lang?}`: the page or one section, `maxChars` at a time, a cursor for the rest. */
export function readDocById(set: DocsSet, input: ReadInput) {
  const lang = input.lang ?? 'en';
  const p = set.index.pages.find((x) => x.id === input.id);
  if (!p)
    throw new Error(
      `no page "${input.id}" in this documentation (${set.provenance.label}): search_docs or list_docs give the ids there are; a planned page has no text yet`,
    );
  const md = p.langs[lang] ? set.pages[`${lang}/${p.id}`] : undefined;
  if (md === undefined)
    throw new Error(`${p.id} is not written in ${lang}: it is in ${LANGS.filter((l) => p.langs[l]).join(', ')}`);
  const sections = splitSections(md);
  let text = md;
  if (input.section !== undefined) {
    const s = sections.find((x) => x.id === input.section);
    if (!s)
      throw new Error(
        `${p.id} has no section "${input.section}": its sections are ${sections.map((x) => x.id || '(lead, id "")').join(', ')}`,
      );
    text = s.text;
  }
  const max = Math.min(Math.max(1, input.maxChars ?? READ_DEFAULT_CHARS), READ_MAX_CHARS);
  const request = { id: input.id, section: input.section, maxChars: max };
  const from = input.cursor ? cursorOffset(input.cursor, set, lang, request) : 0;
  if (from > text.length) throw new StaleCursor('this cursor points past the end of the text');
  let to = Math.min(text.length, from + max);
  // Cut at a line's end when one is in the last half of the window: a reader gets whole lines.
  if (to < text.length) {
    const nl = text.lastIndexOf('\n', to);
    if (nl > from + max / 2) to = nl + 1;
  }
  const ref = input.section ? `${p.id}#${input.section}` : p.id;
  const cursor =
    to < text.length ? encodeCursor({ r: revisionOf(set), l: lang, q: requestHash(request), o: to }) : undefined;
  const header = provenanceLine(set.provenance, { ref, lang, state: p.state });
  const more = cursor
    ? `\n\n> characters ${from}–${to} of ${text.length}: read_doc again with the same id, section and lang and cursor "${cursor}" for the rest`
    : '';
  return {
    text: `${header}\n\n${text.slice(from, to)}${more}`,
    structured: {
      ref,
      id: p.id,
      section: input.section ?? null,
      lang,
      state: p.state,
      range: { from, to, total: text.length },
      ...(cursor ? { cursor } : {}),
      sections: sections.map((s) => ({ id: s.id, title: s.title })),
      provenance: set.provenance,
    },
  };
}
