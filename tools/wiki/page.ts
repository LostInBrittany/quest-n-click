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
export const ANCHOR_LINE = ANCHOR;
/** A page source in its language folder: `<id>.md`. */
const PAGE_FILE = /^([a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
/** `> [!LIMIT id=local-only]`: a structured block, paired by id between the languages. */
const BLOCK = /^>\s*\[!(LIMIT|GUARANTEE|MEASURE)\s+id=([a-z0-9]+(?:-[a-z0-9]+)*)\]\s*$/;
/** A product version as SemVer writes it: no leading zero, a pre-release of dot-separated identifiers. */
const SEMVER_SOURCE =
  '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?';
export const SEMVER = new RegExp(`^${SEMVER_SOURCE}$`);
/**
 * A section's own versions (§4.4.1), on the line right after its anchor: `<!-- applies: 4.2.2.. -->` (from 4.2.2),
 * `<!-- applies: 4.2.2..4.4.0 -->` (both inclusive), `<!-- applies: ..4.4.0 -->` (until, from the page's), and
 * `since <v>` after the range for the version the feature appeared in (`<!-- applies: 4.2.2.. since 4.2.0 -->`).
 */
const APPLIES = new RegExp(
  `^<!--\\s*applies:\\s*(${SEMVER_SOURCE})?\\.\\.(${SEMVER_SOURCE})?(?:\\s+since\\s+(${SEMVER_SOURCE}))?\\s*-->$`,
);
/** Anything that looks like an applies marker, so a malformed one is reported rather than ignored. */
const APPLIES_LIKE = /^<!--\s*applies\b/;
/** `<!-- step: install-deps -->`: an essential step's id, the same in both languages (§4.7.1). */
const STEP = /^<!--\s*step:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->$/;

export interface SectionVersions {
  appliesFrom?: string;
  appliesUntil?: string;
  featureSince?: string;
}
/** The versions an applies marker line gives, `null` for a malformed marker, undefined for another line. */
export function appliesMarker(line: string): SectionVersions | null | undefined {
  const t = line.trim();
  if (!APPLIES_LIKE.test(t)) return undefined;
  const m = APPLIES.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return {
    ...(m[1] ? { appliesFrom: m[1] } : {}),
    ...(m[2] ? { appliesUntil: m[2] } : {}),
    ...(m[3] ? { featureSince: m[3] } : {}),
  };
}

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
export function mapLine(line: string, n: number, replace: (l: Link) => string | undefined): string {
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

/** A fenced code block: the first word of its info string, its opening line, the lines between its fences. */
export interface Fence {
  lang: string;
  line: number;
  /** The block's last line, its closing fence (or the page's last line when it is never closed). */
  endLine: number;
  content: string;
}

/**
 * Walks a page line by line, outside fenced code, calling `onLine` with each line, its number and a way to read the
 * next non-blank line; the line it returns replaces it. Each fenced block is handed to `onFence` once closed (or at the
 * end of a page that leaves it open). Returns the page rewritten, and whether a fence was left open.
 */
export function mapLines(
  markdown: string,
  onLine: (line: string, n: number, next: () => string | undefined) => string,
  onFence?: (fence: Fence) => void,
): { text: string; openFence: boolean } {
  const lines = markdown.split('\n');
  let fence: { char: string; length: number; lang: string; line: number; body: string[] } | undefined;
  const close = (endLine: number) => {
    if (fence) onFence?.({ lang: fence.lang, line: fence.line, endLine, content: fence.body.join('\n') });
    fence = undefined;
  };
  const out = lines.map((raw, i) => {
    const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fence) {
      if (mark && mark[1]![0] === fence.char && mark[1]!.length >= fence.length && !mark[2]!.trim()) close(i + 1);
      else fence.body.push(raw);
      return raw;
    }
    // A backtick fence's info string holds no backtick (otherwise the line is inline code).
    if (mark && !(mark[1]![0] === '`' && mark[2]!.includes('`'))) {
      const lang = mark[2]!.trim().split(/\s+/)[0] ?? '';
      fence = { char: mark[1]![0]!, length: mark[1]!.length, lang, line: i + 1, body: [] };
      return raw;
    }
    return onLine(raw, i + 1, () => lines.slice(i + 1).find((l) => l.trim() !== ''));
  });
  const openFence = fence !== undefined;
  close(lines.length);
  return { text: out.join('\n'), openFence };
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

type BlockKind = 'LIMIT' | 'GUARANTEE' | 'MEASURE';
/** A structured block: its kind and id, its opening line, its text (the quoted lines after the opening one). */
export interface Block {
  kind: BlockKind;
  id: string;
  line: number;
  /** The block's lines, their `>` removed, the opening line excepted. */
  body: string[];
  /** Its `- key: value` lines (a measure's date, version, volume, conditions and source), by key. */
  fields: Record<string, string>;
}

export interface ParsedPage {
  sections: string[];
  /** The sections that carry an applies marker (§4.4.1), with the versions it gives and its line. */
  sectionVersions: Record<string, SectionVersions & { line: number }>;
  links: { id: string; anchor?: string; line: number }[];
  /** `#section` links inside the page itself. */
  ownAnchors: { anchor: string; line: number }[];
  repoLinks: { path: string; line: number }[];
  images: { path: string; line: number }[];
  blocks: Block[];
  /** The essential steps' ids, `<!-- step: <id> -->`, in their order. */
  steps: string[];
  /** The fenced code blocks, with the first word of their info string (`room-example`, `studio-config`…). */
  fences: Fence[];
  /** What is malformed in the page itself: an anchor not before a heading, a section id given twice, a bad link. */
  problems: string[];
}

/** Reads a page of `wiki/<lang>/` (a template is read as an English or French page too). */
export function parsePage(markdown: string, lang: string): ParsedPage {
  const page: ParsedPage = {
    sections: [],
    sectionVersions: {},
    links: [],
    ownAnchors: [],
    repoLinks: [],
    images: [],
    blocks: [],
    steps: [],
    fences: [],
    problems: [],
  };
  const lines = markdown.split('\n');
  /** The non-blank lines after line `n` (1-based), with their numbers. */
  const after = (n: number, k: number) => {
    const out: { text: string; line: number }[] = [];
    for (let i = n; i < lines.length && out.length < k; i++)
      if (lines[i]!.trim()) out.push({ text: lines[i]!, line: i + 1 });
    return out;
  };
  /** The line of each marker read as a section's, so the others are reported. */
  const owned = new Set<number>();
  let block: Block | undefined;
  const { openFence } = mapLines(
    markdown,
    (raw, line) => {
      const t = raw.trim();
      const opening = BLOCK.exec(t);
      if (block && !opening && t.startsWith('>')) {
        const text = t.replace(/^>\s?/, '');
        block.body.push(text);
        const field = /^[-*]\s+([a-z]+)\s*:\s*(.*)$/.exec(text.trim());
        if (field && !(field[1]! in block.fields)) block.fields[field[1]!] = field[2]!.trim();
      } else block = undefined;
      const anchor = ANCHOR.exec(t)?.[1];
      if (anchor) {
        if (page.sections.includes(anchor))
          page.problems.push(`line ${line}: the section id "${anchor}" is given twice`);
        else page.sections.push(anchor);
        let [first, second] = after(line, 2);
        const marker = first ? appliesMarker(first.text) : undefined;
        if (marker !== undefined && first) {
          owned.add(first.line);
          if (marker === null)
            page.problems.push(
              `line ${first.line}: the applies marker is malformed (<!-- applies: 4.2.2.. -->, <!-- applies: 4.2.2..4.4.0 since 4.2.0 -->)`,
            );
          else if (!(anchor in page.sectionVersions)) page.sectionVersions[anchor] = { ...marker, line: first.line };
          first = second;
        }
        if (!/^#{1,6}\s/.test(first?.text ?? ''))
          page.problems.push(`line ${line}: the anchor "${anchor}" is not followed by a heading`);
        return raw;
      }
      if (appliesMarker(t) !== undefined) {
        if (!owned.has(line))
          page.problems.push(
            `line ${line}: an applies marker stands on the line right after a section's <a name> anchor`,
          );
        return raw;
      }
      const step = STEP.exec(t)?.[1];
      if (step) {
        if (page.steps.includes(step)) page.problems.push(`line ${line}: the step id "${step}" is given twice`);
        else page.steps.push(step);
      }
      if (opening) {
        block = { kind: opening[1] as BlockKind, id: opening[2]!, line, body: [], fields: {} };
        page.blocks.push(block);
      }
      mapLine(raw, line, (l) => {
        const target = classifyTarget(l.target, lang);
        if (target.kind === 'own') page.ownAnchors.push({ anchor: target.anchor, line });
        else if (target.kind === 'page') page.links.push({ id: target.id, anchor: target.anchor, line });
        else if (target.kind === 'repo') page.repoLinks.push({ path: target.path, line });
        else if (target.kind === 'wiki-image') page.images.push({ path: target.path, line });
        else if (target.kind === 'invalid') page.problems.push(`line ${line}: the link ${target.problem}`);
        return undefined;
      });
      return raw;
    },
    (fence) => {
      block = undefined;
      page.fences.push(fence);
    },
  );
  if (openFence) page.problems.push('a code fence is never closed');
  return page;
}

/** The set a translation must keep (§4.7.1): link destinations as `id` or `id#section`, never URLs. */
export const linkDestinations = (p: ParsedPage): string[] =>
  [...new Set(p.links.map((l) => (l.anchor ? `${l.id}#${l.anchor}` : l.id)))].sort();
