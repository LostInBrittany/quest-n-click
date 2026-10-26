// Pending acks (4.5.5, #360). Every conflict on wiki/translations.json replayed since 4.5.0 was the same section
// recorded by two open branches. So a branch no longer writes the two record files: `translations --ack` and
// `review-claim` write its own `changes/<slug>.acks.json` (its pair acks and its claim reviews), next to its
// fragments, and two branches write two files. Only main, master and a release branch write wiki/translations.json and
// wiki/reviews.json; the release folds the pending files into them (`wiki -- acks --fold`, a step of `prepare`), as it
// folds the fragments.
//
// Where an ack goes: `--pending <slug>` names the file; otherwise main, master and `release/*` write the two files;
// another branch writes `changes/<slug>.acks.json`, `<slug>` being the branch without its prefix, as for the fragments
// (`fix/302-ci` → `302-ci`, `docs/4.5.5` → `4.5.5`); a detached HEAD is refused; outside a git repository (a copy of
// the wiki) it is the two files. Every reader sees the two files plus every pending file: per section or claim, the
// records whose hashes are the current text's win, their reviewers merged (the file's first, then the pending files in
// name order); with none, the two files' record (else the most recent pending one) says what changed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { formatJson } from './json';
import { issuesOf } from './manifest';
import { type Reviewer, ReviewerSchema } from './reviewer';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const reviewers = z.array(ReviewerSchema).min(1);
const PairRecordSchema = z.object({ enHash: hash, frHash: hash, reviewers }).strict();
const ClaimRecordSchema = z.object({ claimTextHash: hash, testFileHash: hash, reviewers }).strict();
export type PairRecord = z.infer<typeof PairRecordSchema>;
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

const PendingSchema = z
  .object({
    format: z.literal('quest-n-click-docs-acks'),
    version: z.literal(1),
    pairs: z.record(z.string(), PairRecordSchema),
    claims: z.record(z.string(), ClaimRecordSchema),
  })
  .strict();
export type Pending = z.infer<typeof PendingSchema>;
/** A pending file as read: where it is (relative to the repository, `changes/<slug>.acks.json`) and its records. */
export interface PendingFile extends Pending {
  file: string;
}

const SLUG = /^[A-Za-z0-9._-]+$/;
/** The folder of the fragments and the pending files: beside the wiki folder. */
const changesDir = (wikiDir: string) => resolve(wikiDir, '..', 'changes');
const emptyPending = (): Pending => ({ format: 'quest-n-click-docs-acks', version: 1, pairs: {}, claims: {} });

function git(cwd: string, ...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Where an ack or a review goes: `{ file, slug }` for a pending file, `{}` for the two record files, `{ error }` when
 * it cannot tell (see the head of this file).
 */
export function pendingTarget(wikiDir: string, slug?: string): { file?: string; slug?: string; error?: string } {
  const at = (s: string) => ({ file: join(changesDir(wikiDir), `${s}.acks.json`), slug: s });
  if (slug !== undefined)
    return SLUG.test(slug)
      ? at(slug)
      : { error: `--pending is a slug (letters, digits, ".", "-", "_"), not "${slug}"` };
  if (git(wikiDir, 'rev-parse', '--is-inside-work-tree') !== 'true') return {};
  const branch = git(wikiDir, 'symbolic-ref', '--short', '-q', 'HEAD');
  if (!branch)
    return {
      error:
        'no branch is checked out: name the pending file with --pending <slug> (it writes changes/<slug>.acks.json)',
    };
  if (branch === 'main' || branch === 'master' || branch.startsWith('release/')) return {};
  const derived = branch.replace(/^[^/]+\//, '').replace(/\//g, '-');
  return SLUG.test(derived)
    ? at(derived)
    : { error: `the branch ${branch} gives no slug: name the pending file with --pending <slug>` };
}

/** Every pending file beside the wiki, in name order. */
export function readPending(wikiDir: string): { files: PendingFile[]; errors: string[] } {
  const dir = changesDir(wikiDir);
  const files: PendingFile[] = [];
  const errors: string[] = [];
  if (!existsSync(dir)) return { files, errors };
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.acks.json'))
    .sort()) {
    const file = `changes/${name}`;
    try {
      const parsed = PendingSchema.safeParse(JSON.parse(readFileSync(join(dir, name), 'utf8')));
      if (parsed.success) files.push({ file, ...parsed.data });
      else errors.push(...issuesOf(parsed.error).map((l) => `${file} ${l}`));
    } catch (e) {
      errors.push(`${file}: ${(e as Error).message}`);
    }
  }
  return { files, errors };
}

/** A pending file to write into: what it holds, or an empty one. */
export function loadPending(file: string): { pending?: Pending; error?: string } {
  if (!existsSync(file)) return { pending: emptyPending() };
  try {
    const parsed = PendingSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success
      ? { pending: parsed.data }
      : {
          error: issuesOf(parsed.error)
            .map((l) => `${file} ${l}`)
            .join('; '),
        };
  } catch (e) {
    return { error: `${file}: ${(e as Error).message}` };
  }
}

const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

export function writePending(file: string, p: Pending): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatJson({ ...p, pairs: sorted(p.pairs), claims: sorted(p.claims) }));
}

/** Several records' reviewers as one: in the order they come, one per name, the latest date kept in its place. */
function mergeReviewers(lists: readonly (readonly Reviewer[])[]): Reviewer[] {
  const out: Reviewer[] = [];
  for (const r of lists.flat()) {
    const i = out.findIndex((x) => x.name === r.name);
    if (i < 0) out.push(r);
    else if (r.date > out[i]!.date) out[i] = r;
  }
  return out;
}

/** A record of the two files or of a pending file, with where it comes from. */
export interface Candidate<T> {
  record: T;
  /** The pending file, or undefined for the two files. */
  file?: string;
}

/**
 * The record a section or claim is judged by, from its candidates (the two files' first): the ones holding the current
 * text, merged; else the two files' record, else the most recent pending one, to say what changed.
 */
export function judge<T extends { reviewers: Reviewer[] }>(
  candidates: readonly Candidate<T>[],
  holds: (r: T) => boolean,
): { record?: T; holds: boolean } {
  const holding = candidates.filter((c) => holds(c.record));
  if (holding.length)
    return {
      record: { ...holding[0]!.record, reviewers: mergeReviewers(holding.map((c) => c.record.reviewers)) },
      holds: true,
    };
  const own = candidates.find((c) => !c.file);
  const latest = [...candidates].sort((a, b) =>
    (a.record.reviewers.at(-1)?.date ?? '') < (b.record.reviewers.at(-1)?.date ?? '') ? -1 : 1,
  );
  return { record: (own ?? latest.at(-1))?.record, holds: false };
}

/** Deletes the pending files the fold read (relative to the repository: `changes/<slug>.acks.json`). */
export function removePending(wikiDir: string, files: readonly string[]): void {
  for (const f of files) rmSync(resolve(wikiDir, '..', f), { force: true });
}
