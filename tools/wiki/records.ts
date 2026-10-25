// The wiki's review records on disk (4.5.5, #360): one file per record, named by its key and the first 8 hex of its
// two hashes, so two pull requests that record the same section (or claim) write two different files and git merges
// them with no conflict. `wiki/translations/<page>/<section>.<en8>.<fr8>.json` holds a translation pair,
// `wiki/reviews/<claim>.<text8>.<test8>.json` a claim's scope review.
//
// Written append-only: recording a pair or a review adds a file, or adds a reviewer to the record of the same texts,
// and never deletes one. A record that replaces another is up to 46% similar to it (same reviewer line, measured), so a
// deletion beside the addition could be taken by git for a rename, and two branches renaming one file two ways is a
// conflict again. The records a newer one supersedes, or whose key is gone, are removed apart (`wiki -- records
// --prune`, deletions only, which `release -- prepare` runs). The single files of 4.5.0 to 4.5.4
// (`wiki/translations.json`, `wiki/reviews.json`) are refused while they exist; `wiki -- records --migrate` folds them in.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { z } from 'zod';
import { formatJson } from './json';
import { issuesOf } from './manifest';
import { type Reviewer, withReviewer } from './reviewer';

/** A kind of record: where its files live, how a key maps to a file name, the two hashes the name carries. */
export interface Store<T extends { reviewers: Reviewer[] }> {
  /** The folder under the wiki: `translations`, `reviews`. */
  dir: string;
  /** The single file it replaced, under the wiki: `translations.json`, `reviews.json`. */
  legacy: string;
  schema: z.ZodType<T>;
  /** The file name's stem for a key (`create.rooms/walkable-zones`), or undefined when the key cannot be one. */
  stem(key: string): string | undefined;
  /** The key a stem names, or undefined when the stem is no key's. */
  key(stem: string): string | undefined;
  /** The record's two hashes, in the order the file name carries them. */
  hashes(r: T): [string, string];
}

export interface Stored<T> {
  key: string;
  /** The file, relative to the wiki folder, with `/`. */
  file: string;
  record: T;
}

const NAME = /^(.+)\.([0-9a-f]{8})\.([0-9a-f]{8})\.json$/;

/** The file of a record, relative to the wiki folder. */
function recordFile<T extends { reviewers: Reviewer[] }>(store: Store<T>, key: string, r: T): string {
  const stem = store.stem(key);
  if (!stem) throw new Error(`${key} is no key of wiki/${store.dir}/`);
  const [a, b] = store.hashes(r);
  return `${store.dir}/${stem}.${a.slice(0, 8)}.${b.slice(0, 8)}.json`;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/**
 * Every record of a store, by key, in file order; an unreadable file, a name no key has, or a name whose hashes are
 * not its content's is an error. While the single file of 4.5.4 is still there, an error says how to fold it in.
 */
export function readStore<T extends { reviewers: Reviewer[] }>(
  wikiDir: string,
  store: Store<T>,
): { records: Map<string, Stored<T>[]>; errors: string[] } {
  const records = new Map<string, Stored<T>[]>();
  const errors: string[] = [];
  if (existsSync(resolve(wikiDir, store.legacy)))
    errors.push(
      `${store.legacy}: the single file of 4.5.4 is still there; npm run wiki -- records --migrate moves its records into wiki/${store.dir}/ (one file per record, so two pull requests no longer conflict on it), then commit both`,
    );
  for (const path of filesUnder(resolve(wikiDir, store.dir)).sort()) {
    const file = relative(wikiDir, path).split('\\').join('/');
    const m = NAME.exec(file.slice(store.dir.length + 1));
    const key = m && store.key(m[1]!);
    if (!m || !key) {
      errors.push(`${file}: not a record's name (<key>.<8 hex>.<8 hex>.json)`);
      continue;
    }
    let parsed: z.ZodSafeParseResult<T>;
    try {
      parsed = store.schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    } catch (e) {
      errors.push(`${file}: ${(e as Error).message}`);
      continue;
    }
    if (!parsed.success) {
      errors.push(...issuesOf(parsed.error).map((l) => `${file} ${l}`));
      continue;
    }
    const [a, b] = store.hashes(parsed.data);
    if (a.slice(0, 8) !== m[2] || b.slice(0, 8) !== m[3]) {
      errors.push(
        `${file}: its name says ${m[2]}.${m[3]}, its content ${a.slice(0, 8)}.${b.slice(0, 8)} (renamed by hand?)`,
      );
      continue;
    }
    const list = records.get(key) ?? [];
    list.push({ key, file, record: parsed.data });
    records.set(key, list);
  }
  return { records, errors };
}

/** The most recent of a key's records: by its last reviewer's date, then by file order. */
export function latest<T extends { reviewers: Reviewer[] }>(list: readonly Stored<T>[]): Stored<T> | undefined {
  let best: Stored<T> | undefined;
  for (const s of list)
    if (!best || (s.record.reviewers.at(-1)?.date ?? '') >= (best.record.reviewers.at(-1)?.date ?? '')) best = s;
  return best;
}

/**
 * Records `reviewer` for `key` on the texts `record` holds the hashes of: a reviewer more on the record of the same
 * texts, else a new file. Never deletes a file (see the head of this file). Returns the file written.
 */
export function addRecord<T extends { reviewers: Reviewer[] }>(
  wikiDir: string,
  store: Store<T>,
  existing: readonly Stored<T>[],
  key: string,
  record: Omit<T, 'reviewers'>,
  reviewer: Reviewer,
): string {
  const probe = { ...record, reviewers: [reviewer] } as T;
  const [a, b] = store.hashes(probe);
  const same = existing.find((s) => {
    const [x, y] = store.hashes(s.record);
    return x === a && y === b;
  });
  const out = same ? { ...probe, reviewers: withReviewer(same.record.reviewers, reviewer) } : probe;
  const file = recordFile(store, key, out);
  mkdirSync(dirname(resolve(wikiDir, file)), { recursive: true });
  writeFileSync(resolve(wikiDir, file), formatJson(out));
  return file;
}

/** Deletes record files (relative to the wiki folder) and the page folders they leave empty. */
export function removeRecords(wikiDir: string, files: readonly string[]): void {
  for (const f of files) {
    const path = resolve(wikiDir, f);
    rmSync(path, { force: true });
    const dir = dirname(path);
    if (existsSync(dir) && !readdirSync(dir).length && relative(wikiDir, dir).includes('/'))
      rmSync(dir, { recursive: true });
  }
}

/** Two reviewer lists as one: `ours` in its order, then the names only `theirs` has; for a name in both, the later. */
function unionReviewers(ours: readonly Reviewer[], theirs: readonly Reviewer[]): Reviewer[] {
  const out = [...ours];
  for (const r of theirs) {
    const i = out.findIndex((x) => x.name === r.name);
    if (i < 0) out.push(r);
    else if (r.date > out[i]!.date) out[i] = r;
  }
  return out;
}

export interface Migration {
  /** Records written as new files. */
  written: number;
  /** Records already there with the same texts, their reviewers merged in. */
  merged: number;
  /** Records already there, identical. */
  unchanged: number;
}

/**
 * Folds the single file of 4.5.4 into the store, then deletes it. Re-runnable: run again on a branch that merged a
 * main where the old file came back, it adds what the file holds that the folder lacks, and loses nothing (a record of
 * the same texts keeps the folder's reviewers and gains the file's). The records it supersedes stay until `--prune`.
 */
export function migrateLegacy<T extends { reviewers: Reviewer[] }>(
  wikiDir: string,
  store: Store<T>,
  entries: (json: unknown) => { entries?: Record<string, T>; errors: string[] },
): { migration?: Migration; errors: string[] } {
  const legacy = resolve(wikiDir, store.legacy);
  if (!existsSync(legacy)) return { migration: { written: 0, merged: 0, unchanged: 0 }, errors: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(legacy, 'utf8'));
  } catch (e) {
    return { errors: [`${store.legacy}: ${(e as Error).message}`] };
  }
  const read = entries(json);
  if (!read.entries) return { errors: read.errors };
  const migration: Migration = { written: 0, merged: 0, unchanged: 0 };
  for (const [key, record] of Object.entries(read.entries)) {
    const file = resolve(wikiDir, recordFile(store, key, record));
    let out = record;
    if (existsSync(file)) {
      const there = store.schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (!there.success) return { errors: issuesOf(there.error).map((l) => `${relative(wikiDir, file)} ${l}`) };
      out = { ...record, reviewers: unionReviewers(there.data.reviewers, record.reviewers) };
      if (formatJson(out) === formatJson(there.data)) {
        migration.unchanged++;
        continue;
      }
      migration.merged++;
    } else migration.written++;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, formatJson(out));
  }
  rmSync(legacy);
  return { migration, errors: [] };
}
