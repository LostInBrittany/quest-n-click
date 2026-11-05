// npx tsx tools/next-mark.ts [--write] --version=<x.y.z> (#443): the next release's mark, written where a version will
// go, and the release's rewrite of it. Until 4.7.0 every branch guessed the next version ("4.6.1") and 4.7.0 renamed
// about 80 marks by hand (#434). A branch now writes `next` in the version's place:
//
// - in a fragment, the wiki's prose and a code comment: a parenthesis that opens on the word, `(next)` or
//   `(next, #417)`, `(next, i18n.images)`; the parenthesis follows a space, a line start or punctuation, never a word
//   (a call such as `swap(next)` in a comment is code, not a mark);
// - in a wiki section's `applies` marker: `<!-- applies: next.. since next -->`;
// - in wiki/manifest.json: `"appliesFrom": "next"` (and `appliesUntil`, `featureSince`).
//
// What is never a mark: the word in a code span or a fenced block (that is how the docs quote the mark itself), in code
// outside a comment (`if (next) {`), in a string (a test's name is what a claim names), in a historical file (the LOG,
// the CHANGELOG's released sections, docs/, tests/fixtures/). `npm run changes -- --assemble --version=<v>` rewrites
// the fragments; `prepare` runs this tool with `--write` for the rest, then carries the translation pairs and claim
// reviews recorded before the rewrite over to the rewritten text (`rekey`), so a mechanical rewrite leaves nothing to
// review. Without `--write` it lists what it would rewrite.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The word that stands for the next release's version. */
export const NEXT = 'next';

/** A mark in prose: `(next)` or `(next, …`, the parenthesis not right after a word character or a backtick. */
const PROSE_MARK = /(?<![\w`])\(next(?=[,)])/g;
/** A code span: a run of backticks to the next run of the same length (#364's rule). */
const CODE_SPAN = /(`+)[\s\S]*?(?<!`)\1(?!`)/g;

/** `text` with the prose marks given `version`, its code spans left as written. */
function proseRewrite(text: string, version: string) {
  let out = '';
  let at = 0;
  for (const m of text.matchAll(CODE_SPAN)) {
    out += text.slice(at, m.index).replace(PROSE_MARK, `(${version}`) + m[0];
    at = m.index + m[0].length;
  }
  return out + text.slice(at).replace(PROSE_MARK, `(${version}`);
}

/**
 * A Markdown text (a fragment, a wiki page) with its marks given `version`: prose and `applies` markers, no code. A
 * paragraph is read whole, so a code span wrapped over a line break stays a code span.
 */
export function rewriteMarkdown(text: string, version: string) {
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(...proseRewrite(paragraph.join('\n'), version).split('\n'));
    paragraph = [];
  };
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fence = !fence;
      out.push(line);
    } else if (fence) out.push(line);
    else if (/^<!--\s*applies:/.test(line.trim())) {
      flush();
      out.push(line.replace(/(?<=[\s.:])next(?=[\s.]|$)/g, version));
    } else if (!line.trim()) {
      flush();
      out.push(line);
    } else paragraph.push(line);
  }
  flush();
  return out.join('\n');
}

/** Whether `prefix` leaves a quote open: an odd count of unescaped `'`, `"` or backticks (a string, not code). */
const inString = (prefix: string) =>
  ["'", '"', '`'].some((q) => (prefix.match(new RegExp(`(?<!\\\\)${q}`, 'g')) ?? []).length % 2 === 1);

/** Where a comment starts on a line: `//` (not a URL's `://`) or `/*`, outside a string; or nothing. */
function commentStart(line: string): { index: number; 0: string } | undefined {
  for (const m of line.matchAll(/(?<![:/])\/\/|\/\*/g)) if (!inString(line.slice(0, m.index))) return m as never;
  return undefined;
}

/**
 * A source file (TypeScript, JavaScript, CSS) with the marks of its comments given `version`: after `//` (not a URL's
 * `://`), inside `/* … *\/` over any number of lines. Code and strings are left alone.
 */
export function rewriteCode(text: string, version: string) {
  let block = false;
  return text
    .split('\n')
    .map((line) => {
      let out = '';
      let rest = line;
      while (rest) {
        if (block) {
          const end = rest.indexOf('*/');
          const comment = end < 0 ? rest : rest.slice(0, end + 2);
          out += proseRewrite(comment, version);
          rest = end < 0 ? '' : rest.slice(end + 2);
          block = end < 0;
          continue;
        }
        const line_ = commentStart(rest);
        if (!line_) {
          out += rest;
          break;
        }
        out += rest.slice(0, line_.index);
        if (line_[0] === '//') {
          out += proseRewrite(rest.slice(line_.index), version);
          break;
        }
        block = true;
        out += '/*';
        rest = rest.slice(line_.index + 2);
      }
      return out;
    })
    .join('\n');
}

/** wiki/manifest.json with its version fields that say `next` given `version`. */
export const rewriteManifest = (text: string, version: string) =>
  text.replace(/("(?:appliesFrom|appliesUntil|featureSince)":\s*)"next"/g, `$1"${version}"`);

const CODE_EXT = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|css)$/;
/**
 * The folders whose source files the rewrite reads: the code roots of a fragment, the Studio Server and the tests. Not
 * `games/`: a game folder is written through the Studio's journal only (tests/single-entry.test.ts), so a mark in a
 * game's comment is renamed by hand.
 */
const CODE_DIRS = ['src/', 'bridge/', 'tools/', 'scripts/', 'cli/', 'connectors/', 'studio-server/', 'tests/'];

/** How a tracked file is rewritten, or undefined when it is not: history, fixtures, generated or vendored files. */
export function markKind(path: string): 'markdown' | 'code' | 'manifest' | undefined {
  if (path === 'wiki/manifest.json') return 'manifest';
  if (path === 'changes/README.md') return 'markdown';
  if (/^wiki\/(en|fr)\/[^/]+\.md$/.test(path)) return 'markdown';
  if (path.startsWith('tests/fixtures/') || path.includes('/node_modules/') || path.includes('.gen.')) return undefined;
  if (CODE_DIRS.some((d) => path.startsWith(d)) && CODE_EXT.test(path)) return 'code';
  return undefined;
}

/** A file's text with its marks given `version`, as its kind reads them. */
export function rewriteFile(kind: 'markdown' | 'code' | 'manifest', text: string, version: string) {
  if (kind === 'markdown') return rewriteMarkdown(text, version);
  if (kind === 'code') return rewriteCode(text, version);
  return rewriteManifest(text, version);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The records with each hash taken before the rewrite replaced by its value after (#443): a pair's side, a claim's text,
 * a claim's test file. A hash that was not the current text's before (a stale record) stays stale; a record never
 * becomes current because of the rewrite. `before` and `after` map a key to its current hash at each moment.
 */
export function rekey<R extends Record<string, unknown>>(
  records: Record<string, R>,
  fields: readonly {
    field: keyof R & string;
    before: (key: string, r: R) => string | undefined;
    after: (key: string, r: R) => string | undefined;
  }[],
): { records: Record<string, R>; moved: number } {
  let moved = 0;
  const out: Record<string, R> = {};
  for (const [key, r] of Object.entries(records)) {
    const next = { ...r };
    for (const f of fields) {
      const [was, now] = [f.before(key, r), f.after(key, r)];
      if (was !== undefined && now !== undefined && was !== now && r[f.field] === was) {
        (next as Record<string, unknown>)[f.field] = now;
        moved++;
      }
    }
    out[key] = next;
  }
  return { records: out, moved };
}

export { sha256 as textHashOf };

if (process.argv[1]?.endsWith('next-mark.ts')) {
  const args = process.argv.slice(2);
  const version = args.find((a) => a.startsWith('--version='))?.slice(10);
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('usage: npx tsx tools/next-mark.ts [--write] --version=<x.y.z>');
    process.exit(2);
  }
  const root = resolve(import.meta.dirname, '..');
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const changed: { path: string; before: string; after: string }[] = [];
  for (const path of tracked) {
    const kind = markKind(path);
    const file = resolve(root, path);
    if (!kind || !existsSync(file)) continue;
    const before = readFileSync(file, 'utf8');
    if (!before.includes(NEXT)) continue;
    const after = rewriteFile(kind, before, version);
    if (after !== before) changed.push({ path, before, after });
  }
  if (!args.includes('--write')) {
    for (const c of changed) console.log(`would rewrite ${c.path}`);
    console.log(`${changed.length} file(s) to rewrite, the mark ${NEXT} made ${version}`);
    process.exit(0);
  }
  const { rewriteWithRecords } = await import('./next-mark-records');
  const moved = rewriteWithRecords(root, changed);
  console.log(
    `✔  ${changed.length} file(s): the mark ${NEXT} written ${version}${changed.length ? ` (${changed.map((c) => c.path).join(', ')})` : ''}; ${moved.pairs} pair hash(es) and ${moved.claims} claim hash(es) carried over`,
  );
}
