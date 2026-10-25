// The translation state (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.7.1, phase A5): no language is the source. For
// each section of a `ready` page, a record says which revision of each language someone (a person or an AI) read
// against the other, `{enHash, frHash, reviewers}`, in `wiki/translations/<id>/<section>.<en8>.<fr8>.json` (`_lead` for
// the text before the first section; one file per record since 4.5.5, records.ts), each reviewer `{name, kind:
// human|ai, relation: author|independent, date}` (reviewer.ts). A section is judged by its record of the current texts;
// when either side's text, or an image a section shows, changed since every record it has, the pair is "to review": a
// warning at the work level, an error for `check --publish`. A pair read by an AI only is said as such at both levels,
// never as a review, and no longer fails a publication (D56 amends A7, which wanted a person on every pair). `npm run
// wiki -- translations --ack <id#section> --by <name> --kind human|ai --relation author|independent` records the pair,
// once both sides were read.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { splitSections } from './docs';
import { issuesOf, type Manifest } from './manifest';
import { classifyTarget, mapLine, mapLines } from './page';
import { addRecord, latest, migrateLegacy, readStore, removeRecords, type Store, type Stored } from './records';
import { humanReviewed, type Reviewer, ReviewerSchema } from './reviewer';

/** The key of the text before a page's first section: `_` is never in a section id. */
const LEAD = '_lead';
const PAGE = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION = /^(?:_lead|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const PairSchema = z.object({ enHash: hash, frHash: hash, reviewers: z.array(ReviewerSchema).min(1) }).strict();
export type Pair = z.infer<typeof PairSchema>;

const STORE: Store<Pair> = {
  dir: 'translations',
  legacy: 'translations.json',
  schema: PairSchema,
  stem: (key) => {
    const [id, section, more] = key.split('#');
    return more === undefined && PAGE.test(id ?? '') && SECTION.test(section ?? '') ? `${id}/${section}` : undefined;
  },
  key: (stem) => {
    const [id, section, more] = stem.split('/');
    return more === undefined && PAGE.test(id ?? '') && SECTION.test(section ?? '') ? `${id}#${section}` : undefined;
  },
  hashes: (r) => [r.enHash, r.frHash],
};

/** The single file of 4.5.0 to 4.5.4, read only to be migrated. */
const LegacySchema = z
  .object({
    format: z.literal('quest-n-click-docs-translations'),
    version: z.literal(1),
    pairs: z.record(
      z.string().refine((k) => !!STORE.stem(k), 'a key <id>#<section>'),
      PairSchema,
    ),
  })
  .strict();

/** Every key's records (more than one after two branches recorded the same section, until `records --prune`). */
export interface Translations {
  records: Map<string, Stored<Pair>[]>;
}

export function readTranslations(wikiDir: string): { translations: Translations; errors: string[] } {
  const { records, errors } = readStore(wikiDir, STORE);
  return { translations: { records }, errors };
}

/** `records --migrate`: `wiki/translations.json` into `wiki/translations/`, the file deleted (records.ts). */
export const migrateTranslations = (wikiDir: string) =>
  migrateLegacy(wikiDir, STORE, (json) => {
    const parsed = LegacySchema.safeParse(json);
    return parsed.success
      ? { entries: parsed.data.pairs, errors: [] }
      : { errors: issuesOf(parsed.error).map((l) => `${STORE.legacy} ${l}`) };
  });

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
  /** `paired`: a record holds both current hashes; `to review`: no record, or a side changed since every one. */
  state: 'paired' | 'to review';
  why?: string;
  /** A paired pair's reviewers, and whether a person is among them (a publication needs one). */
  reviewers?: Reviewer[];
  human?: boolean;
}

/** The current hashes of every section both languages of a written (not planned, not generated) page hold. */
function currentHashes(
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

/** The record a section is judged by: the one of its current texts, else its most recent. */
function judged(list: readonly Stored<Pair>[], now: { enHash: string; frHash: string }): Stored<Pair> | undefined {
  return list.find((s) => s.record.enHash === now.enHash && s.record.frHash === now.frHash) ?? latest(list);
}

/**
 * The pairs of every `ready` page: one per section present in both languages (a section in one language only is the
 * parity check's error, not a pair). Also the record files no current pair needs (`superseded`: a key's records
 * beside the one it is judged by, and every record of a key no written page holds), for `records --prune`.
 */
export function translationStates(
  wikiDir: string,
  manifest: Manifest,
  translations: Translations,
): { pairs: PairState[]; superseded: string[] } {
  const pairs: PairState[] = [];
  const current = currentHashes(wikiDir, manifest);
  const superseded: string[] = [];
  for (const [key, list] of translations.records) {
    const now = current.get(key);
    // A draft's records are kept (a pair may be read before the page is ready); only a ready page's pairs are judged.
    const keep = now && judged(list, now);
    superseded.push(...list.filter((s) => s !== keep).map((s) => s.file));
  }
  for (const [key, now] of current) {
    if (!now.ready) continue;
    const list = translations.records.get(key) ?? [];
    const r = judged(list, now)?.record;
    const since = r?.reviewers.at(-1)?.date;
    if (!r) pairs.push({ key, state: 'to review', why: 'never reviewed as a pair' });
    else if (r.enHash !== now.enHash && r.frHash !== now.frHash)
      pairs.push({ key, state: 'to review', why: `both sides changed since ${since}` });
    else if (r.enHash !== now.enHash)
      pairs.push({ key, state: 'to review', why: `the English changed since ${since}` });
    else if (r.frHash !== now.frHash) pairs.push({ key, state: 'to review', why: `the French changed since ${since}` });
    else pairs.push({ key, state: 'paired', reviewers: r.reviewers, human: humanReviewed(r.reviewers) });
  }
  return { pairs, superseded: superseded.sort() };
}

/** Each recorded key's record as the check judges it (the build's page headers read who reviewed them). */
export function judgedPairs(wikiDir: string, manifest: Manifest, translations: Translations): Record<string, Pair> {
  const current = currentHashes(wikiDir, manifest);
  const out: Record<string, Pair> = {};
  for (const [key, list] of translations.records) {
    const now = current.get(key);
    const r = now ? judged(list, now) : latest(list);
    if (r) out[key] = r.record;
  }
  return out;
}

/** `records --prune`: deletes the superseded records (deletions only, records.ts). Returns the files deleted. */
export function pruneTranslations(wikiDir: string, manifest: Manifest): { removed: string[]; errors: string[] } {
  const { translations, errors } = readTranslations(wikiDir);
  if (errors.length) return { removed: [], errors };
  const { superseded } = translationStates(wikiDir, manifest, translations);
  removeRecords(wikiDir, superseded);
  return { removed: superseded, errors: [] };
}

/**
 * `translations --ack <id#section> --by <name>`: records the pair as it is now. The page must be written in both
 * languages and hold that section in both. Adds a file, or a reviewer to the record of the same texts; never deletes
 * one (records.ts). Returns the problem, or undefined.
 */
export function ackTranslation(o: {
  wikiDir: string;
  manifest: Manifest;
  key: string;
  reviewer: Reviewer;
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
  const { translations, errors } = readTranslations(o.wikiDir);
  if (errors.length) return errors.join('; ');
  // The same texts read again add a reviewer (a person after the AI that wrote them); changed texts start over.
  addRecord(
    o.wikiDir,
    STORE,
    translations.records.get(o.key) ?? [],
    o.key,
    { enHash: sides.en!, frHash: sides.fr! },
    o.reviewer,
  );
  return undefined;
}
