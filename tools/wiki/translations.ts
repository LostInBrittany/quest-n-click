// The translation state (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.7.1, phase A5): no language is the source. For
// each section of a `ready` page, `wiki/translations.json` records which revision of each language someone (a person
// or an AI) read against the other, `{enHash, frHash, reviewers}` under `<id>#<section>` (`<id>#_lead` for the text before the first
// section), each reviewer `{name, kind: human|ai, relation: author|independent, date}` (reviewer.ts). When either
// side's text, or an image a section shows, changes, the pair is "to review": a warning at the work level, an error for
// `check --publish`. A pair read by an AI only is said as such at both levels, never as a review, and no longer fails
// a publication (D56 amends A7, which wanted a person on every pair). `npm run wiki -- translations --ack <id#section> --by <name>
// --kind human|ai --relation author|independent` records the pair, once both sides were read: on an open branch into its
// own pending file, `changes/<slug>.acks.json`, which every reader adds to this one and the release folds in
// (pending.ts, 4.5.5, #360), so two branches never change this file's lines.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { splitSections } from './docs';
import { formatJson } from './json';
import { issuesOf, type Manifest } from './manifest';
import { classifyTarget, mapLine, mapLines } from './page';
import {
  type Candidate,
  judge,
  loadPending,
  type PairRecord,
  type PendingFile,
  pendingTarget,
  readPending,
  writePending,
} from './pending';
import { humanReviewed, type Reviewer, ReviewerSchema, withReviewer } from './reviewer';

const TRANSLATIONS_FILE = 'translations.json';
/** The key of the text before a page's first section: `_` is never in a section id. */
const LEAD = '_lead';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const TranslationsSchema = z
  .object({
    format: z.literal('quest-n-click-docs-translations'),
    version: z.literal(1),
    pairs: z.record(
      z.string().regex(/^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*#(?:_lead|[a-z0-9]+(?:-[a-z0-9]+)*)$/, 'a key <id>#<section>'),
      z.object({ enHash: hash, frHash: hash, reviewers: z.array(ReviewerSchema).min(1) }).strict(),
    ),
  })
  .strict();
type TranslationsFile = z.infer<typeof TranslationsSchema>;
/** wiki/translations.json, and the pending files of the branches (pending.ts) every reader adds to it. */
export type Translations = TranslationsFile & { pending: PendingFile[] };

export function readTranslations(wikiDir: string): { translations: Translations; errors: string[] } {
  const { files: pending, errors: pendingErrors } = readPending(wikiDir);
  const { file, errors } = readTranslationsFile(wikiDir);
  return { translations: { ...file, pending }, errors: [...errors, ...pendingErrors] };
}

function readTranslationsFile(wikiDir: string): { file: TranslationsFile; errors: string[] } {
  const empty: TranslationsFile = { format: 'quest-n-click-docs-translations', version: 1, pairs: {} };
  const file = resolve(wikiDir, TRANSLATIONS_FILE);
  if (!existsSync(file)) return { file: empty, errors: [] };
  try {
    const parsed = TranslationsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) return { file: empty, errors: issuesOf(parsed.error).map((l) => `${TRANSLATIONS_FILE} ${l}`) };
    return { file: parsed.data, errors: [] };
  } catch (e) {
    return { file: empty, errors: [`${TRANSLATIONS_FILE}: ${(e as Error).message}`] };
  }
}

/** A key's records: the file's first, then each pending file's, in name order. */
const candidatesOf = (t: Translations, key: string): Candidate<PairRecord>[] => [
  ...(t.pairs[key] ? [{ record: t.pairs[key] }] : []),
  ...t.pending.flatMap((p) => (p.pairs[key] ? [{ record: p.pairs[key], file: p.file }] : [])),
];

/** A section's text as a pair compares it: line ends made LF, outer blank lines dropped. */
/**
 * A section's hash: its text (line ends made LF, outer blank lines dropped) and the bytes of each image of `wiki/images/`
 * it shows, so a replaced screenshot makes the pair to review like a changed sentence.
 */
function sectionHash(text: string, wikiDir: string, lang: string): string {
  const h = createHash('sha256').update(text.replace(/\r\n/g, '\n').trim());
  const images: string[] = [];
  mapLines(
    text,
    (line, n) =>
      mapLine(line, n, (l) => {
        const t = classifyTarget(l.target, lang);
        if (t.kind === 'wiki-image') images.push(t.path);
        return undefined;
      }),
    undefined,
    { joinLinks: true },
  );
  for (const image of images) {
    const file = resolve(wikiDir, 'images', image);
    h.update(`\0${image}\0`);
    if (existsSync(file)) h.update(readFileSync(file));
  }
  return h.digest('hex');
}

/** Each section of a page in one language, by its key's section part (`_lead` for the lead), with its hash. */
function sectionHashes(markdown: string, wikiDir: string, lang: string): Map<string, string> {
  return new Map(
    splitSections(markdown.replace(/\r\n/g, '\n')).map((s) => [s.id || LEAD, sectionHash(s.text, wikiDir, lang)]),
  );
}

export interface PairState {
  key: string;
  /** `paired`: both hashes as recorded; `to review`: no record, or a side changed since. */
  state: 'paired' | 'to review';
  why?: string;
  /** A paired pair's reviewers, and whether a person is among them (a publication needs one). */
  reviewers?: Reviewer[];
  human?: boolean;
}

/**
 * The current hashes of every section both languages of a written page hold (a draft's included: its records are
 * kept, a pair may be read before the page is ready), in the manifest's and the pages' order.
 */
function currentPairHashes(
  wikiDir: string,
  manifest: Manifest,
): Map<string, { enHash: string; frHash: string; ready: boolean }> {
  const out = new Map<string, { enHash: string; frHash: string; ready: boolean }>();
  for (const p of manifest.pages.filter((x) => x.state !== 'planned' && !x.generated)) {
    const files = { en: resolve(wikiDir, 'en', `${p.id}.md`), fr: resolve(wikiDir, 'fr', `${p.id}.md`) };
    if (!existsSync(files.en) || !existsSync(files.fr)) continue;
    const en = sectionHashes(readFileSync(files.en, 'utf8'), wikiDir, 'en');
    const fr = sectionHashes(readFileSync(files.fr, 'utf8'), wikiDir, 'fr');
    for (const [section, enHash] of en) {
      const frHash = fr.get(section);
      if (frHash !== undefined) out.set(`${p.id}#${section}`, { enHash, frHash, ready: p.state === 'ready' });
    }
  }
  return out;
}

const holdsPair = (now: { enHash: string; frHash: string } | undefined) => (r: PairRecord) =>
  !!now && r.enHash === now.enHash && r.frHash === now.frHash;

/**
 * The pairs of every `ready` page: one per section present in both languages (a section in one language only is the
 * parity check's error, not a pair), judged on the file's records and the pending ones (pending.ts). Also the records
 * that name no section of a written page (`stale`, `<file>: <key>`), which the release's fold removes.
 */
export function translationStates(
  wikiDir: string,
  manifest: Manifest,
  translations: Translations,
): { pairs: PairState[]; stale: string[] } {
  const pairs: PairState[] = [];
  const current = currentPairHashes(wikiDir, manifest);
  for (const [key, now] of current) {
    if (!now.ready) continue;
    const { record: r, holds } = judge(candidatesOf(translations, key), holdsPair(now));
    const since = r?.reviewers.at(-1)?.date;
    if (!r) pairs.push({ key, state: 'to review', why: 'never reviewed as a pair' });
    else if (holds) pairs.push({ key, state: 'paired', reviewers: r.reviewers, human: humanReviewed(r.reviewers) });
    else if (r.enHash !== now.enHash && r.frHash !== now.frHash)
      pairs.push({ key, state: 'to review', why: `both sides changed since ${since}` });
    else if (r.enHash !== now.enHash)
      pairs.push({ key, state: 'to review', why: `the English changed since ${since}` });
    else pairs.push({ key, state: 'to review', why: `the French changed since ${since}` });
  }
  const stale = [
    ...Object.keys(translations.pairs)
      .filter((k) => !current.has(k))
      .map((k) => `${TRANSLATIONS_FILE}: ${k}`),
    ...translations.pending.flatMap((p) =>
      Object.keys(p.pairs)
        .filter((k) => !current.has(k))
        .map((k) => `${p.file}: ${k}`),
    ),
  ];
  return { pairs, stale };
}

/** Each recorded key's record as the check judges it (the build's page headers read who reviewed it). */
export function judgedPairs(
  wikiDir: string,
  manifest: Manifest,
  translations: Translations,
): Record<string, PairRecord> {
  const current = currentPairHashes(wikiDir, manifest);
  const keys = new Set([
    ...Object.keys(translations.pairs),
    ...translations.pending.flatMap((p) => Object.keys(p.pairs)),
  ]);
  const out: Record<string, PairRecord> = {};
  for (const key of keys) {
    const { record } = judge(candidatesOf(translations, key), holdsPair(current.get(key)));
    if (record) out[key] = record;
  }
  return out;
}

/** What the release's fold did to the pairs: what it kept, what no longer held, the people whose old reading it replaced. */
export interface PairFold {
  pairs: Record<string, PairRecord>;
  kept: number;
  dropped: { key: string; file: string; record: PairRecord }[];
  replaced: { key: string; reviewer: Reviewer; now: Reviewer[] }[];
}

/**
 * `acks --fold`, the pairs: for each section of a written page, the records that hold its current text (the file's and
 * the pending ones, reviewers merged) become the file's record; a section none holds keeps the file's record as it is.
 * A pending record that holds no current text is dropped and listed; a person's review of the file's record that a
 * pending one of a newer text replaces is listed too. The file's records of a section gone are removed.
 */
export function foldTranslations(wikiDir: string, manifest: Manifest, t: Translations): PairFold {
  const current = currentPairHashes(wikiDir, manifest);
  const fold: PairFold = { pairs: {}, kept: 0, dropped: [], replaced: [] };
  for (const [key, now] of current) {
    const candidates = candidatesOf(t, key);
    const holds = holdsPair(now);
    const { record, holds: held } = judge(candidates, holds);
    for (const c of candidates)
      if (c.file && !holds(c.record)) fold.dropped.push({ key, file: c.file, record: c.record });
    if (held) {
      fold.kept += candidates.some((c) => c.file && holds(c.record)) ? 1 : 0;
      const old = t.pairs[key];
      if (old && !holds(old))
        for (const r of old.reviewers.filter((x) => x.kind === 'human'))
          fold.replaced.push({ key, reviewer: r, now: record!.reviewers });
      fold.pairs[key] = { enHash: now.enHash, frHash: now.frHash, reviewers: record!.reviewers };
    } else if (t.pairs[key]) fold.pairs[key] = t.pairs[key];
  }
  for (const p of t.pending)
    for (const [key, record] of Object.entries(p.pairs))
      if (!current.has(key)) fold.dropped.push({ key, file: p.file, record });
  return fold;
}

/** Writes wiki/translations.json as the fold left it, keys sorted. */
export function writeTranslations(wikiDir: string, pairs: Record<string, PairRecord>): void {
  writeFileSync(
    resolve(wikiDir, TRANSLATIONS_FILE),
    formatJson({
      format: 'quest-n-click-docs-translations',
      version: 1,
      pairs: Object.fromEntries(Object.entries(pairs).sort(([a], [b]) => (a < b ? -1 : 1))),
    }),
  );
}

/**
 * `translations --ack <id#section> --by <name>`: records the pair as it is now. The page must be written in both
 * languages and hold that section in both. On an open branch it goes into the branch's pending file (pending.ts),
 * never into wiki/translations.json; on main, master or a release branch into the file, a record no current pair names
 * dropped at the same time. Returns the problem, or undefined.
 */
export function ackTranslation(o: {
  wikiDir: string;
  manifest: Manifest;
  key: string;
  reviewer: Reviewer;
  /** `--pending <slug>`: the pending file to write, whatever the branch. */
  pending?: string;
}): string | undefined {
  const at = o.key.indexOf('#');
  if (at < 0) return `"${o.key}" is not <id>#<section> (${LEAD} for the text before the first section)`;
  const [id, section] = [o.key.slice(0, at), o.key.slice(at + 1)];
  const page = o.manifest.pages.find((p) => p.id === id);
  if (!page || page.generated || page.state === 'planned') return `${id} is not a written page of the manifest`;
  const sides: Record<'en' | 'fr', string | undefined> = { en: undefined, fr: undefined };
  for (const lang of ['en', 'fr'] as const) {
    const file = resolve(o.wikiDir, lang, `${id}.md`);
    if (!existsSync(file)) return `${lang}/${id}.md does not exist`;
    sides[lang] = sectionHashes(readFileSync(file, 'utf8'), o.wikiDir, lang).get(section);
    if (!sides[lang]) return `${lang}/${id}.md has no section "${section}"`;
  }
  const target = pendingTarget(o.wikiDir, o.pending);
  if (target.error) return target.error;
  // The same texts read again add a reviewer (a person after the AI that wrote them); changed texts start over.
  const next = (old: PairRecord | undefined): PairRecord => ({
    enHash: sides.en!,
    frHash: sides.fr!,
    reviewers:
      old && old.enHash === sides.en && old.frHash === sides.fr
        ? withReviewer(old.reviewers, o.reviewer)
        : [o.reviewer],
  });
  if (target.file) {
    const { pending, error } = loadPending(target.file);
    if (!pending) return error;
    pending.pairs[o.key] = next(pending.pairs[o.key]);
    writePending(target.file, pending);
    return undefined;
  }
  const { translations, errors } = readTranslations(o.wikiDir);
  if (errors.length) return errors.join('; ');
  translations.pairs[o.key] = next(translations.pairs[o.key]);
  const current = currentPairHashes(o.wikiDir, o.manifest);
  for (const k of Object.keys(translations.pairs)) if (!current.has(k)) delete translations.pairs[k];
  writeTranslations(o.wikiDir, translations.pairs);
  return undefined;
}
