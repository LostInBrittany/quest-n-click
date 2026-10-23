// Reading one wiki page (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 and §4.7.1): its section ids, its links to other
// pages, its links to the repository's files and its structured blocks. A section id is a plain HTML anchor on its own
// line, `<a name="walkable-zones"></a>`, right before the heading it names: GitHub honours it in the file view and in
// the wiki, and it is the same in both languages, so a link survives a translated heading. A link to another page is
// the relative source file, `create.rooms.md#walkable-zones`: clickable in the repository, rewritten by each build.
// Fenced code is skipped: an example may show a link or an anchor without being one.

/** A section anchor line: `<a name="id"></a>` (or `<a id="id"></a>`), nothing else on the line. */
const ANCHOR = /^<a (?:name|id)="([a-z0-9]+(?:-[a-z0-9]+)*)"><\/a>\s*$/;
/** A link to another page's source: `<id>.md`, optionally `#<section>`. */
const PAGE_LINK = /^([a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*)\.md(?:#([A-Za-z0-9_-]+))?$/;
/** `> [!LIMIT id=local-only]`: a structured block, paired by id between the languages. */
const BLOCK = /^>\s*\[!(LIMIT|GUARANTEE|MEASURE)\s+id=([a-z0-9]+(?:-[a-z0-9]+)*)\]\s*$/;

interface PageLink {
  /** The target page's id. */
  id: string;
  anchor?: string;
  line: number;
}
interface RepoLink {
  /** The path from the repository's root, forward slashes, no `..`. */
  path: string;
  anchor?: string;
  line: number;
}
export interface ParsedPage {
  sections: string[];
  links: PageLink[];
  /** `#section` links inside the page itself. */
  ownAnchors: { anchor: string; line: number }[];
  repoLinks: RepoLink[];
  blocks: { kind: 'LIMIT' | 'GUARANTEE' | 'MEASURE'; id: string; line: number }[];
  /** What is malformed in the page itself: an anchor not followed by a heading, a section id given twice. */
  problems: string[];
}

/** The targets of `[text](target)` on a line, with their column, inline code removed first. */
function linkTargets(line: string): string[] {
  const visible = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  return [...visible.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!);
}

/**
 * The repository path a link from `wiki/<lang>/` designates: `../../src/x.ts` is relative to the page's file, as GitHub
 * resolves it; `src/x.ts` is read from the repository's root. Undefined when it leaves the repository.
 */
export function repoPathOf(target: string): string | undefined {
  const parts = (target.startsWith('../') || target.startsWith('./') ? `wiki/en/${target}` : target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (!out.length) return undefined;
      out.pop();
    } else out.push(p);
  }
  return out.length ? out.join('/') : undefined;
}

export function parsePage(markdown: string): ParsedPage {
  const page: ParsedPage = { sections: [], links: [], ownAnchors: [], repoLinks: [], blocks: [], problems: [] };
  const lines = markdown.split('\n');
  let fence: string | undefined;
  lines.forEach((raw, i) => {
    const line = i + 1;
    const fenceMark = /^\s*(```|~~~)/.exec(raw)?.[1];
    if (fenceMark) {
      if (!fence) fence = fenceMark;
      else if (fence === fenceMark) fence = undefined;
      return;
    }
    if (fence) return;
    const anchor = ANCHOR.exec(raw.trim())?.[1];
    if (anchor) {
      if (page.sections.includes(anchor)) page.problems.push(`line ${line}: the section id "${anchor}" is given twice`);
      else page.sections.push(anchor);
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (!next || !/^#{1,6}\s/.test(next))
        page.problems.push(`line ${line}: the anchor "${anchor}" is not followed by a heading`);
      return;
    }
    const block = BLOCK.exec(raw.trim());
    if (block) page.blocks.push({ kind: block[1] as 'LIMIT' | 'GUARANTEE' | 'MEASURE', id: block[2]!, line });
    for (const target of linkTargets(raw)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (target.startsWith('#')) {
        page.ownAnchors.push({ anchor: target.slice(1), line });
        continue;
      }
      const toPage = PAGE_LINK.exec(target);
      if (toPage) {
        page.links.push({ id: toPage[1]!, anchor: toPage[2], line });
        continue;
      }
      const [pathPart = '', anchorPart] = target.split('#');
      const path = repoPathOf(pathPart);
      if (path === undefined) page.problems.push(`line ${line}: the link "${target}" leaves the repository`);
      else page.repoLinks.push({ path, anchor: anchorPart, line });
    }
  });
  if (fence) page.problems.push('a code fence is never closed');
  return page;
}

/** The set a translation must keep (§4.7.1): link destinations as `id` or `id#section`, never URLs. */
export const linkDestinations = (p: ParsedPage): string[] =>
  [...new Set(p.links.map((l) => (l.anchor ? `${l.id}#${l.anchor}` : l.id)))].sort();
