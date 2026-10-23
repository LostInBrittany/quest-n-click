// Reading one wiki page (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 and §4.7.1): its section ids, its links and its
// structured blocks. A section id is a plain HTML anchor on its own line, `<a name="walkable-zones"></a>`, right before
// the heading it names: GitHub honours it in the file view and in the wiki, and it is the same in both languages, so a
// link survives a translated heading. Links are relative to the page's own folder, `wiki/<lang>/`, as GitHub resolves
// them in the file view: another page is `create.rooms.md#walkable-zones` (or `./create.rooms.md`), a repository file
// is `../../src/engine/core/save.ts`, an image of the wiki is `../images/x.png`. A bare `src/x.ts` would resolve to
// `wiki/<lang>/src/x.ts` on GitHub: it is refused with the right form. One scanner finds the links for the check and
// rewrites them for the build, so both read the same links: titled links, images, a linked image's outer link; and
// neither reads inside fenced code (closed only by a fence of the same character, at least as long) or inline code.

/** A section anchor line: `<a name="id"></a>` (or `<a id="id"></a>`), nothing else on the line. */
const ANCHOR = /^<a (?:name|id)="([a-z0-9]+(?:-[a-z0-9]+)*)"><\/a>\s*$/;
/** A page source in its language folder: `<id>.md`. */
const PAGE_FILE = /^([a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
/** `> [!LIMIT id=local-only]`: a structured block, paired by id between the languages. */
const BLOCK = /^>\s*\[!(LIMIT|GUARANTEE|MEASURE)\s+id=([a-z0-9]+(?:-[a-z0-9]+)*)\]\s*$/;

/** One Markdown link or image, as written. */
export interface Link {
  image: boolean;
  label: string;
  target: string;
  title?: string;
  line: number;
}

/** What a link's target designates, read from `wiki/<lang>/`. */
type Target =
  | { kind: 'external' }
  | { kind: 'own'; anchor: string }
  | { kind: 'page'; id: string; anchor?: string }
  /** A file of the repository, its path from the root. */
  | { kind: 'repo'; path: string; anchor?: string }
  /** A file under `wiki/images/`, its path inside that folder. */
  | { kind: 'wiki-image'; path: string }
  | { kind: 'invalid'; problem: string };

/** The path `wiki/<lang>/<rel>` normalises to, or undefined when it climbs above the repository. */
function resolveFrom(lang: string, rel: string): string | undefined {
  const out: string[] = [];
  for (const p of `wiki/${lang}/${rel}`.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (!out.length) return undefined;
      out.pop();
    } else out.push(p);
  }
  return out.join('/');
}

export function classifyTarget(target: string, lang: string): Target {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return { kind: 'external' };
  if (target.startsWith('#')) return { kind: 'own', anchor: target.slice(1) };
  const hash = target.indexOf('#');
  const rel = hash < 0 ? target : target.slice(0, hash);
  const anchor = hash < 0 ? undefined : target.slice(hash + 1) || undefined;
  if (rel.startsWith('/'))
    return { kind: 'invalid', problem: `"${target}" is absolute: write it relative to the page` };
  const path = resolveFrom(lang, rel);
  if (path === undefined) return { kind: 'invalid', problem: `"${target}" leaves the repository` };
  const inLang = `wiki/${lang}/`;
  if (path.startsWith(inLang)) {
    const page = PAGE_FILE.exec(path.slice(inLang.length));
    if (page) return { kind: 'page', id: page[1]!, anchor };
    return {
      kind: 'invalid',
      problem: `"${target}" resolves to ${path}: a repository file is written from the page's folder, ../../${rel.replace(/^\.\//, '')}`,
    };
  }
  if (path.startsWith('wiki/images/')) return { kind: 'wiki-image', path: path.slice('wiki/images/'.length) };
  if (/^wiki\/(en|fr)\//.test(path))
    return { kind: 'invalid', problem: `"${target}" points into another language: link the page as <id>.md` };
  return { kind: 'repo', path, anchor };
}

/** The end of a bracketed label starting at `open` (`[`), nested brackets counted, or -1. */
function closeBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '[') depth++;
    else if (s[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

/** `(target "title")` from `open` (`(`): the target, its title and the index of the closing `)`, or undefined. */
function destination(s: string, open: number): { target: string; title?: string; end: number } | undefined {
  let i = open + 1;
  while (s[i] === ' ') i++;
  let target = '';
  if (s[i] === '<') {
    const close = s.indexOf('>', i);
    if (close < 0) return undefined;
    target = s.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i]!;
      if (c === '\\') {
        target += s[++i] ?? '';
        continue;
      }
      if (c === ' ') break;
      if (c === '(') depth++;
      if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
      target += c;
    }
  }
  while (s[i] === ' ') i++;
  let title: string | undefined;
  const quote = s[i];
  if (quote === '"' || quote === "'" || quote === '(') {
    const close = s.indexOf(quote === '(' ? ')' : quote, i + 1);
    if (close < 0) return undefined;
    title = s.slice(i + 1, close);
    i = close + 1;
    while (s[i] === ' ') i++;
  }
  if (s[i] !== ')' || !target) return undefined;
  return { target, title, end: i };
}

/** Renders a link back, after a rewrite of its target. */
export const renderLink = (l: Omit<Link, 'line'>): string =>
  `${l.image ? '!' : ''}[${l.label}](${l.target}${l.title !== undefined ? ` "${l.title}"` : ''})`;

/**
 * Rewrites the links of a stretch of text outside code: `replace` returns the new text of a link, or undefined to
 * keep it. A link's label is read first, so a linked image's inner image is seen before its outer link.
 */
function mapText(text: string, line: number, replace: (l: Link) => string | undefined): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const image = text[i] === '!' && text[i + 1] === '[';
    const open = image ? i + 1 : i;
    if (text[open] === '[') {
      const close = closeBracket(text, open);
      const dest = close > 0 && text[close + 1] === '(' ? destination(text, close + 1) : undefined;
      if (dest) {
        const label = mapText(text.slice(open + 1, close), line, replace);
        const link: Link = { image, label, target: dest.target, title: dest.title, line };
        out += replace(link) ?? renderLink(link);
        i = dest.end + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/** A line split into inline code spans (kept as written) and text, backtick runs paired as CommonMark pairs them. */
function mapLine(line: string, n: number, replace: (l: Link) => string | undefined): string {
  let out = '';
  let text = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      text += line[i];
      i++;
      continue;
    }
    let run = 0;
    while (line[i + run] === '`') run++;
    // The closing run has exactly the same length: a longer or shorter run inside the span is part of it.
    let close = -1;
    for (let j = i + run; j < line.length; ) {
      if (line[j] !== '`') {
        j++;
        continue;
      }
      let k = 0;
      while (line[j + k] === '`') k++;
      if (k === run) {
        close = j;
        break;
      }
      j += k;
    }
    if (close < 0) {
      text += '`'.repeat(run);
      i += run;
      continue;
    }
    out += mapText(text, n, replace) + line.slice(i, close + run);
    text = '';
    i = close + run;
  }
  return out + mapText(text, n, replace);
}

/**
 * Walks a page line by line, outside fenced code, calling `onLine` with each line, its number and a way to read the
 * next non-blank line; the line it returns replaces it. Returns the page rewritten, and whether a fence was left open.
 */
function mapLines(
  markdown: string,
  onLine: (line: string, n: number, next: () => string | undefined) => string,
): { text: string; openFence: boolean } {
  const lines = markdown.split('\n');
  let fence: { char: string; length: number } | undefined;
  const out = lines.map((raw, i) => {
    const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fence) {
      if (mark && mark[1]![0] === fence.char && mark[1]!.length >= fence.length && !mark[2]!.trim()) fence = undefined;
      return raw;
    }
    // A backtick fence's info string holds no backtick (otherwise the line is inline code).
    if (mark && !(mark[1]![0] === '`' && mark[2]!.includes('`'))) {
      fence = { char: mark[1]![0]!, length: mark[1]!.length };
      return raw;
    }
    return onLine(raw, i + 1, () => lines.slice(i + 1).find((l) => l.trim() !== ''));
  });
  return { text: out.join('\n'), openFence: fence !== undefined };
}

/**
 * The build's side of the one scanner: every link outside code rewritten by `replace` (undefined keeps it), and each
 * structured block's opening line by `block`.
 */
export const mapPage = (
  markdown: string,
  replace: (l: Link) => string | undefined,
  block: (kind: 'LIMIT' | 'GUARANTEE' | 'MEASURE', id: string) => string,
): string =>
  mapLines(markdown, (line, n) => {
    const b = BLOCK.exec(line.trim());
    return b ? block(b[1] as 'LIMIT', b[2]!) : mapLine(line, n, replace);
  }).text;

export interface ParsedPage {
  sections: string[];
  links: { id: string; anchor?: string; line: number }[];
  /** `#section` links inside the page itself. */
  ownAnchors: { anchor: string; line: number }[];
  repoLinks: { path: string; line: number }[];
  images: { path: string; line: number }[];
  blocks: { kind: 'LIMIT' | 'GUARANTEE' | 'MEASURE'; id: string; line: number }[];
  /** What is malformed in the page itself: an anchor not before a heading, a section id given twice, a bad link. */
  problems: string[];
}

/** Reads a page of `wiki/<lang>/` (a template is read as an English or French page too). */
export function parsePage(markdown: string, lang: string): ParsedPage {
  const page: ParsedPage = {
    sections: [],
    links: [],
    ownAnchors: [],
    repoLinks: [],
    images: [],
    blocks: [],
    problems: [],
  };
  const { openFence } = mapLines(markdown, (raw, line, next) => {
    const anchor = ANCHOR.exec(raw.trim())?.[1];
    if (anchor) {
      if (page.sections.includes(anchor)) page.problems.push(`line ${line}: the section id "${anchor}" is given twice`);
      else page.sections.push(anchor);
      if (!/^#{1,6}\s/.test(next() ?? ''))
        page.problems.push(`line ${line}: the anchor "${anchor}" is not followed by a heading`);
      return raw;
    }
    const block = BLOCK.exec(raw.trim());
    if (block) page.blocks.push({ kind: block[1] as 'LIMIT' | 'GUARANTEE' | 'MEASURE', id: block[2]!, line });
    mapLine(raw, line, (l) => {
      const t = classifyTarget(l.target, lang);
      if (t.kind === 'own') page.ownAnchors.push({ anchor: t.anchor, line });
      else if (t.kind === 'page') page.links.push({ id: t.id, anchor: t.anchor, line });
      else if (t.kind === 'repo') page.repoLinks.push({ path: t.path, line });
      else if (t.kind === 'wiki-image') page.images.push({ path: t.path, line });
      else if (t.kind === 'invalid') page.problems.push(`line ${line}: the link ${t.problem}`);
      return undefined;
    });
    return raw;
  });
  if (openFence) page.problems.push('a code fence is never closed');
  return page;
}

/** The set a translation must keep (§4.7.1): link destinations as `id` or `id#section`, never URLs. */
export const linkDestinations = (p: ParsedPage): string[] =>
  [...new Set(p.links.map((l) => (l.anchor ? `${l.id}#${l.anchor}` : l.id)))].sort();
