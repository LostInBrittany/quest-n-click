// A page's guarantees and their three states (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.3, phase A5). A
// `> [!GUARANTEE id=…]` block names a claim of the manifest, `{id, test: "file › name"}`; the claim is shown as what
// is known of it, never more:
//   1. referenced: the test file is tracked and holds a test of that exact name (its `describe` titles and its own,
//      joined with ` › `, read from the source by a scanner of `describe(`, `it(` and `test(` calls);
//   2. executed on <sha>: a Vitest JSON report (`--reporter=json`) says that test `passed`, and the report's sidecar
//      `commit.json`, written beside it by the candidate, names the documented product commit;
//   3. scope reviewed: `wiki/reviews.json` holds a person's record that the test covers the claim, with the hash of
//      the claim's text (the test's name and the block in both languages) and of the test file: any change to either
//      resets it, and `npm run wiki -- review-claim <id> --by <name>` records it again.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { formatJson } from './json';
import { issuesOf, type Manifest, type Page } from './manifest';
import type { Block } from './page';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A text file's hash, its line ends made LF first, so a Windows checkout hashes as a Linux one. */
const textHash = (s: string) => sha256(s.replace(/\r\n/g, '\n'));
const posix = (p: string) => p.replace(/\\/g, '/');

// ------------------------------------------------------------------------------------------------- test names

const TEST_FUNCS = new Set(['describe', 'it', 'test', 'suite']);
const MODIFIERS = new Set([
  'skip',
  'only',
  'concurrent',
  'sequential',
  'todo',
  'fails',
  'skipIf',
  'runIf',
  'each',
  'for',
]);

/**
 * Every test's full name in a test file, `describe › describe › test`, read from the source: the calls `describe(`,
 * `suite(`, `it(` and `test(` (with `.skip`, `.only`…) whose first argument is a string or a template without
 * substitution, nested by the parentheses they open. Comments, strings, templates and regular expressions are
 * skipped, so a title quoted in a string is not read as a test. A title built at run time (a variable, `.each`'s `%s`)
 * is read as written.
 */
export function testNames(source: string): string[] {
  const s = source;
  const names: string[] = [];
  const stack: { title: string; depth: number }[] = [];
  let depth = 0;
  let i = 0;
  /** The last significant character before `i`, to tell a regular expression from a division. */
  let prev = '';
  const readString = (q: string): { value: string; plain: boolean } => {
    let value = '';
    let plain = true;
    i++;
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const c = s[i + 1] ?? '';
        value += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        i += 2;
        continue;
      }
      if (q === '`' && s[i] === '$' && s[i + 1] === '{') {
        plain = false;
        let braces = 0;
        for (; i < s.length; i++) {
          if (s[i] === '{') braces++;
          else if (s[i] === '}' && --braces === 0) break;
        }
        i++;
        continue;
      }
      value += s[i];
      i++;
    }
    i++;
    return { value, plain };
  };
  const skipSpace = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i]!)) i++;
      if (s.startsWith('//', i)) i = s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i);
      else if (s.startsWith('/*', i)) i = s.indexOf('*/', i) < 0 ? s.length : s.indexOf('*/', i) + 2;
      else return;
    }
  };
  while (i < s.length) {
    skipSpace();
    if (i >= s.length) break;
    const c = s[i]!;
    if (c === "'" || c === '"' || c === '`') {
      readString(c);
      prev = 'x';
      continue;
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      // A regular expression: up to its closing slash, outside a character class.
      let inClass = false;
      i++;
      while (i < s.length && s[i] !== '\n') {
        if (s[i] === '\\') i++;
        else if (s[i] === '[') inClass = true;
        else if (s[i] === ']') inClass = false;
        else if (s[i] === '/' && !inClass) break;
        i++;
      }
      i++;
      prev = 'x';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < s.length && /[\w$]/.test(s[i]!)) i++;
      const word = s.slice(start, i);
      const before = s.slice(0, start).trimEnd().at(-1);
      if (TEST_FUNCS.has(word) && before !== '.') {
        // Its modifiers, `.skip`, `.only`, `.each(…)`: read past them to the call's parenthesis.
        let j = i;
        let call = -1;
        for (;;) {
          while (/\s/.test(s[j] ?? '')) j++;
          if (s[j] === '.') {
            j++;
            while (/\s/.test(s[j] ?? '')) j++;
            const m = /^[A-Za-z]+/.exec(s.slice(j));
            if (!m || !MODIFIERS.has(m[0])) break;
            j += m[0].length;
            // `.each([…])(title, …)`, `.skipIf(cond)(title, …)`: the modifier's own arguments come first.
            while (/\s/.test(s[j] ?? '')) j++;
            if (['each', 'for', 'skipIf', 'runIf'].includes(m[0]) && s[j] === '(') {
              let n = 0;
              for (; j < s.length; j++) {
                if (s[j] === '(') n++;
                else if (s[j] === ')' && --n === 0) break;
              }
              j++;
            }
            continue;
          }
          if (s[j] === '(') call = j;
          break;
        }
        if (call >= 0) {
          i = call + 1;
          depth++;
          skipSpace();
          const q = s[i];
          if (q === "'" || q === '"' || q === '`') {
            const { value } = readString(q);
            if (word === 'describe' || word === 'suite') stack.push({ title: value, depth });
            else names.push([...stack.map((d) => d.title), value].join(' › '));
          }
          prev = '(';
          continue;
        }
      }
      prev = 'x';
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      while (stack.length && stack.at(-1)!.depth > depth) stack.pop();
    }
    prev = c;
    i++;
  }
  return names;
}

/** A claim's test, `file › name`, split at its first ` › `. */
function splitTest(test: string): { file: string; name: string } {
  const at = test.indexOf(' › ');
  return { file: test.slice(0, at), name: test.slice(at + 3) };
}

// ------------------------------------------------------------------------------------------------- reports

const REPORT_COMMIT_FILE = 'commit.json';
const ReportCommitSchema = z
  .object({
    format: z.literal('quest-n-click-test-report'),
    version: z.literal(1),
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'the full SHA the suite ran on'),
    run: z.string().regex(/^\d+$/).optional(),
  })
  .strict();

/** One Vitest JSON report: the commit it ran on (its sidecar) and each test's state by file and full name. */
export interface TestReport {
  file: string;
  commit: string;
  run?: string;
  tests: { file: string; name: string; status: string }[];
}

/**
 * A Vitest JSON report (`vitest run --reporter=json --outputFile.json=<file>`) and the `commit.json` beside it,
 * `{format: "quest-n-click-test-report", version: 1, commit, run?}`, which the candidate writes from the checkout it
 * tested. A report without its sidecar names no commit, and proves nothing about one: it is refused.
 */
export function readTestReport(file: string): { report?: TestReport; error?: string } {
  const sidecar = join(dirname(file), REPORT_COMMIT_FILE);
  let raw: {
    testResults?: {
      name?: string;
      assertionResults?: { ancestorTitles?: string[]; title?: string; status?: string }[];
    }[];
  };
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: `${file}: ${(e as Error).message}` };
  }
  if (!Array.isArray(raw.testResults)) return { error: `${file}: not a Vitest JSON report (no testResults)` };
  if (!existsSync(sidecar))
    return { error: `${file}: no ${REPORT_COMMIT_FILE} beside it, so the report names no commit` };
  let commit: z.infer<typeof ReportCommitSchema>;
  try {
    const parsed = ReportCommitSchema.safeParse(JSON.parse(readFileSync(sidecar, 'utf8')));
    if (!parsed.success) return { error: `${sidecar}: ${issuesOf(parsed.error).join('; ')}` };
    commit = parsed.data;
  } catch (e) {
    return { error: `${sidecar}: ${(e as Error).message}` };
  }
  const tests = raw.testResults.flatMap((r) =>
    (r.assertionResults ?? []).map((a) => ({
      file: posix(r.name ?? ''),
      name: [...(a.ancestorTitles ?? []), a.title ?? ''].join(' › '),
      status: a.status ?? 'unknown',
    })),
  );
  return { report: { file, commit: commit.commit, ...(commit.run ? { run: commit.run } : {}), tests } };
}

// ------------------------------------------------------------------------------------------------- reviews

const REVIEWS_FILE = 'reviews.json';
const ReviewsSchema = z
  .object({
    format: z.literal('quest-n-click-docs-reviews'),
    version: z.literal(1),
    claims: z.record(
      z.string(),
      z
        .object({
          claimTextHash: z.string().regex(/^[0-9a-f]{64}$/),
          testFileHash: z.string().regex(/^[0-9a-f]{64}$/),
          by: z.string().trim().min(1).max(80),
          date: z.iso.date(),
        })
        .strict(),
    ),
  })
  .strict();
type Reviews = z.infer<typeof ReviewsSchema>;

/** `wiki/reviews.json`, or an empty record when there is none yet. */
export function readReviews(wikiDir: string): { reviews: Reviews; errors: string[] } {
  const empty: Reviews = { format: 'quest-n-click-docs-reviews', version: 1, claims: {} };
  const file = resolve(wikiDir, REVIEWS_FILE);
  if (!existsSync(file)) return { reviews: empty, errors: [] };
  try {
    const parsed = ReviewsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) return { reviews: empty, errors: issuesOf(parsed.error).map((l) => `${REVIEWS_FILE} ${l}`) };
    return { reviews: parsed.data, errors: [] };
  } catch (e) {
    return { reviews: empty, errors: [`${REVIEWS_FILE}: ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------------------------------------- states

export interface ClaimInput {
  page: Page;
  claim: { id: string; test: string };
  /** The claim's `[!GUARANTEE]` block in each language, when the page is written. */
  blocks: Partial<Record<'en' | 'fr', Block>>;
}

/** The hash a review records of the claim: its test's name and its block's text in both languages. */
const claimTextHash = (c: ClaimInput): string =>
  sha256(
    JSON.stringify({
      test: c.claim.test,
      en: (c.blocks.en?.body ?? []).join('\n').trim(),
      fr: (c.blocks.fr?.body ?? []).join('\n').trim(),
    }),
  );

export interface ClaimState {
  id: string;
  page: string;
  test: string;
  /** Why the claim is not referenced, or undefined when its test exists with that exact name. */
  unreferenced?: string;
  /** The commit a report saw the test pass on, when it is the documented one. */
  executedOn?: string;
  /** Why it is not executed (no report, not found, not passed, another commit). */
  notExecuted?: string;
  reviewed?: { by: string; date: string };
  /** Why a recorded review no longer holds (the claim's text or the test file changed). */
  reviewStale?: string;
  testFileHash?: string;
  claimTextHash: string;
}

/** The words a page header and the build show: what is known, literally. */
export function claimLabel(s: ClaimState): string {
  const parts = [s.unreferenced ? 'not referenced' : 'referenced'];
  if (s.executedOn) parts.push(`executed on ${s.executedOn.slice(0, 12)}`);
  if (s.reviewed) parts.push('scope reviewed');
  return parts.join(' · ');
}

/**
 * Each claim's state: referenced when its test file is tracked and names the test; executed when a report of the
 * documented commit says it passed; scope reviewed when a record holds the current hashes of its text and test file.
 */
export function claimStates(o: {
  root: string;
  tracked: ReadonlySet<string>;
  claims: readonly ClaimInput[];
  reports: readonly TestReport[];
  reviews: Reviews;
  /** The documented product commit, a full SHA; a report of another commit executes nothing. */
  commit?: string;
}): ClaimState[] {
  const sources = new Map<string, string | undefined>();
  return o.claims.map((c) => {
    const { file, name } = splitTest(c.claim.test);
    const state: ClaimState = { id: c.claim.id, page: c.page.id, test: c.claim.test, claimTextHash: claimTextHash(c) };
    if (!o.tracked.has(file)) state.unreferenced = `the test file ${file} is not tracked`;
    else {
      if (!sources.has(file)) sources.set(file, readFileSync(join(o.root, file), 'utf8'));
      const text = sources.get(file)!;
      state.testFileHash = textHash(text);
      if (!testNames(text).includes(name)) state.unreferenced = `${file} holds no test named "${name}"`;
    }
    const own = o.reports.filter((r) => r.commit === o.commit);
    const hits = own.flatMap((r) =>
      r.tests.filter((t) => (t.file === file || t.file.endsWith(`/${file}`)) && t.name === name),
    );
    if (!o.reports.length) state.notExecuted = 'no test report given (--test-report)';
    else if (!o.commit) state.notExecuted = 'no documented commit to compare the reports with';
    else if (!own.length)
      state.notExecuted = `the reports name ${[...new Set(o.reports.map((r) => r.commit.slice(0, 12)))].join(', ')}, not the documented commit ${o.commit.slice(0, 12)}`;
    else if (!hits.length) state.notExecuted = `no report of ${o.commit.slice(0, 12)} ran "${c.claim.test}"`;
    else if (!hits.every((h) => h.status === 'passed'))
      state.notExecuted = `"${c.claim.test}" did not pass on ${o.commit.slice(0, 12)} (${hits.map((h) => h.status).join(', ')})`;
    else state.executedOn = o.commit;
    const review = o.reviews.claims[c.claim.id];
    if (review) {
      if (review.claimTextHash !== state.claimTextHash) state.reviewStale = "the claim's text changed since its review";
      else if (review.testFileHash !== state.testFileHash) state.reviewStale = 'the test file changed since its review';
      else state.reviewed = { by: review.by, date: review.date };
    }
    return state;
  });
}

/**
 * `wiki -- review-claim <id> --by <name>`: records that a person read the claim and its test, and found the test
 * covers it. Refused for a claim that is not referenced (no test to review). Returns the problem, or undefined.
 */
export function reviewClaim(o: { wikiDir: string; state: ClaimState; by: string; date: string }): string | undefined {
  if (o.state.unreferenced) return `${o.state.id} is not referenced (${o.state.unreferenced}): nothing to review`;
  if (!o.by.trim()) return '--by names who reviewed it';
  const { reviews, errors } = readReviews(o.wikiDir);
  if (errors.length) return errors.join('; ');
  reviews.claims[o.state.id] = {
    claimTextHash: o.state.claimTextHash,
    testFileHash: o.state.testFileHash!,
    by: o.by.trim(),
    date: o.date,
  };
  reviews.claims = Object.fromEntries(Object.entries(reviews.claims).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(resolve(o.wikiDir, REVIEWS_FILE), formatJson(reviews));
  return undefined;
}

/** The claims of the manifest's written pages, each with its blocks; claim ids are unique across the manifest. */
export function claimsOf(
  manifest: Manifest,
  blocksOf: (page: Page, lang: 'en' | 'fr') => readonly Block[] | undefined,
): ClaimInput[] {
  return manifest.pages.flatMap((page) =>
    (page.claims ?? []).map((claim) => ({
      page,
      claim,
      blocks: Object.fromEntries(
        (['en', 'fr'] as const).flatMap((l) => {
          const b = blocksOf(page, l)?.find((x) => x.kind === 'GUARANTEE' && x.id === claim.id);
          return b ? [[l, b]] : [];
        }),
      ),
    })),
  );
}
