// `npm run wiki -- records --resolve --by <name>` (4.5.5, #360): resolves a merge that stopped on
// `wiki/translations.json` or `wiki/reviews.json`. Every such conflict replayed since 4.5.0 was the same key recorded
// on both sides (the same section, or claim, edited and acked by both pull requests); the merged text is then usually
// a third one, so the resolution is mechanical:
//   1. the three versions come from the index (`:1:` base, `:2:` ours = HEAD, `:3:` theirs = what is merged in), never
//      from the conflict markers: git may merge half of a record cleanly (one side's hashes) and conflict on the rest
//      (the other side's reviewers), and a side rebuilt from the markers would put a person's review on a text they
//      never read. A file staged with its markers is refused, with `git checkout -m` to bring the stages back;
//   2. main's side is theirs when the commit merged in (MERGE_HEAD) is in upstream/main, origin/main or main (main
//      merged into a branch); ours when the current branch is main or master, HEAD is in main, or a rebase is replaying
//      commits onto it (a branch merged into main); otherwise it refuses and asks for `--main=ours|theirs`;
//   3. per key: what only one side changed since the base is that side's; what both changed is the record whose
//      hashes are the current texts' (main's first, then the other's), else it is recorded again, as an AI
//      (`--kind ai --relation author`, by `--by`), never as a person;
//   4. a person's review on either side of a key both changed, and not in the result, is printed, with the command a
//      person runs once they read it again.
// It writes clean, valid files and stages nothing: the person adds them and commits.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { checkWiki, trackedFiles } from './check';
import { ReviewsSchema } from './claims';
import { formatJson } from './json';
import { issuesOf, type Manifest } from './manifest';
import type { Reviewer } from './reviewer';
import { currentPairHashes, hasConflictMarkers, TranslationsSchema } from './translations';

type Side = 'ours' | 'theirs';
type Rec = { reviewers: Reviewer[] } & Record<string, unknown>;
interface Versions {
  base?: Record<string, Rec>;
  ours: Record<string, Rec>;
  theirs: Record<string, Rec>;
}

/** One file's resolution: what it took from where, what it recorded again, the people's reviews it could not keep. */
export interface Resolution {
  file: string;
  fromMain: number;
  fromOther: number;
  /** Keys both sides changed, with the record kept: main's, the other's (its hashes are the text's), or a new AI one. */
  both: { key: string; kept: 'main' | 'other' | 'again' | 'none' }[];
  lostHuman: { key: string; reviewer: Reviewer }[];
}

const MAIN_REFS = ['upstream/main', 'origin/main', 'main'];

function gitIn(root: string) {
  return (...args: string[]): string | undefined => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
    } catch {
      return undefined;
    }
  };
}

/** Which side of the merge is main's, and why (see the head of this file). */
export function mainSide(root: string, override?: string): { side?: Side; why: string } {
  if (override === 'ours' || override === 'theirs') return { side: override, why: `--main=${override}` };
  if (override !== undefined) return { why: `--main is ours or theirs, not "${override}"` };
  const git = gitIn(root);
  const refs = MAIN_REFS.filter((r) => git('rev-parse', '-q', '--verify', `${r}^{commit}`) !== undefined);
  const inMain = (rev: string) => refs.find((r) => git('merge-base', '--is-ancestor', rev, r) !== undefined);
  if (git('rev-parse', '-q', '--verify', 'MERGE_HEAD') !== undefined) {
    const branch = git('symbolic-ref', '--short', '-q', 'HEAD');
    if (branch === 'main' || branch === 'master')
      return { side: 'ours', why: `you are on ${branch}: ours (HEAD) is main` };
    const theirs = inMain('MERGE_HEAD');
    if (theirs) return { side: 'theirs', why: `the commit merged in is in ${theirs}: theirs is main` };
    const ours = inMain('HEAD');
    if (ours) return { side: 'ours', why: `HEAD is in ${ours}: ours is main` };
    return { why: 'neither side of the merge is in main: say which with --main=ours|theirs' };
  }
  if (git('rev-parse', '-q', '--verify', 'REBASE_HEAD') !== undefined)
    return { side: 'ours', why: 'a rebase replays your commits onto main: ours (HEAD) is main' };
  return { why: 'no merge in progress: say which side is main with --main=ours|theirs' };
}

/**
 * The three versions of a records file from the index, undefined when the file is not in conflict; an error when it
 * holds markers git no longer knows (staged as it was).
 */
function versionsOf(
  root: string,
  path: string,
  field: 'pairs' | 'claims',
  parse: (text: string, label: string) => Record<string, Rec>,
  errors: string[],
): Versions | undefined {
  const git = gitIn(root);
  const rel = relative(realpathSync(root), realpathSync(path)).split('\\').join('/');
  const stages = git('ls-files', '-u', '--', rel);
  if (stages) {
    const blob = (n: number) => git('show', `:${n}:${rel}`);
    const base = blob(1);
    return {
      ...(base !== undefined ? { base: parse(base, `${rel} (base)`) } : {}),
      ours: parse(blob(2) ?? `{"${field}":{}}`, `${rel} (ours)`),
      theirs: parse(blob(3) ?? `{"${field}":{}}`, `${rel} (theirs)`),
    };
  }
  if (hasConflictMarkers(readFileSync(path, 'utf8')))
    errors.push(
      `${rel} holds conflict markers git no longer knows (staged as it was?): git checkout -m -- ${rel} brings the conflict back, then run this again`,
    );
  return undefined;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges a records file's versions key by key. `match(key, r)` says whether a record holds the current texts' hashes,
 * `again(key)` is the record an AI ack would write now (undefined for a key no text holds any more).
 */
function mergeRecords(
  v: Versions,
  side: Side,
  match: (key: string, r: Rec) => boolean,
  again: (key: string) => Rec | undefined,
): { records: Record<string, Rec>; resolution: Omit<Resolution, 'file'> } {
  const main = side === 'ours' ? v.ours : v.theirs;
  const other = side === 'ours' ? v.theirs : v.ours;
  const records: Record<string, Rec> = {};
  const resolution: Omit<Resolution, 'file'> = { fromMain: 0, fromOther: 0, both: [], lostHuman: [] };
  const keys = [...new Set([...Object.keys(main), ...Object.keys(other), ...Object.keys(v.base ?? {})])].sort();
  for (const key of keys) {
    const [m, o, b] = [main[key], other[key], v.base?.[key]];
    const put = (r: Rec | undefined) => {
      if (r) records[key] = r;
    };
    if (same(m, o)) put(m);
    else if (v.base && same(o, b)) {
      put(m);
      resolution.fromMain++;
    } else if (v.base && same(m, b)) {
      put(o);
      resolution.fromOther++;
    } else {
      // Both changed it (or, with no base, they differ): the record of the current texts, else read again by an AI.
      const kept = m && match(key, m) ? m : o && match(key, o) ? o : again(key);
      put(kept);
      resolution.both.push({
        key,
        kept: !kept ? 'none' : kept === m ? 'main' : kept === o ? 'other' : 'again',
      });
      for (const r of [...(m?.reviewers ?? []), ...(o?.reviewers ?? [])])
        if (
          r.kind === 'human' &&
          !kept?.reviewers.some((x) => same(x, r)) &&
          !resolution.lostHuman.some((l) => l.key === key && same(l.reviewer, r))
        )
          resolution.lostHuman.push({ key, reviewer: r });
    }
  }
  return { records, resolution };
}

/** Each conflicted records file of `wikiDir`, resolved and written (not staged). */
export function resolveRecords(o: { wikiDir: string; by: string; date: string; main?: string }): {
  resolutions: Resolution[];
  side?: string;
  errors: string[];
} {
  const root = gitIn(o.wikiDir)('rev-parse', '--show-toplevel');
  if (!root) return { resolutions: [], errors: [`${o.wikiDir} is not in a git repository`] };
  const files = {
    translations: resolve(o.wikiDir, 'translations.json'),
    reviews: resolve(o.wikiDir, 'reviews.json'),
  };
  const errors: string[] = [];
  const parser =
    (schema: typeof TranslationsSchema | typeof ReviewsSchema, field: 'pairs' | 'claims') =>
    (text: string, label: string): Record<string, Rec> => {
      try {
        const parsed = schema.safeParse(JSON.parse(text));
        if (parsed.success) return (parsed.data as unknown as Record<string, Record<string, Rec>>)[field]!;
        errors.push(...issuesOf(parsed.error).map((l) => `${label} ${l}`));
      } catch (e) {
        errors.push(`${label}: ${(e as Error).message}`);
      }
      return {};
    };
  const translations = existsSync(files.translations)
    ? versionsOf(root, files.translations, 'pairs', parser(TranslationsSchema, 'pairs'), errors)
    : undefined;
  const reviews = existsSync(files.reviews)
    ? versionsOf(root, files.reviews, 'claims', parser(ReviewsSchema, 'claims'), errors)
    : undefined;
  if (errors.length) return { resolutions: [], errors };
  if (!translations && !reviews)
    return {
      resolutions: [],
      errors: ['neither wiki/translations.json nor wiki/reviews.json is in conflict: nothing to resolve'],
    };
  // The hashes are the pages' and the tests' as merged: a page or a test still in conflict would be hashed with its markers.
  const unmerged = (gitIn(root)('diff', '--name-only', '--diff-filter=U') ?? '')
    .split('\n')
    .filter((f) => f && !/(^|\/)(translations|reviews)\.json$/.test(f));
  if (unmerged.length)
    return {
      resolutions: [],
      errors: [
        `resolve these first, then run it again: ${unmerged.join(', ')} (the records hash the merged pages and tests)`,
      ],
    };
  const { side, why } = mainSide(root, o.main);
  if (!side) return { resolutions: [], errors: [why] };
  const reviewer: Reviewer = { name: o.by, kind: 'ai', relation: 'author', date: o.date };
  const resolutions: Resolution[] = [];
  const manifest = (): Manifest | undefined =>
    checkWiki({ wikiDir: o.wikiDir, tracked: trackedFiles(root), root }).manifest;
  if (translations) {
    const m = manifest();
    if (!m) return { resolutions: [], errors: ['the manifest does not read (manifest.json): resolve it first'] };
    const now = currentPairHashes(o.wikiDir, m);
    const { records, resolution } = mergeRecords(
      translations,
      side,
      (key, r) => r.enHash === now.get(key)?.enHash && r.frHash === now.get(key)?.frHash,
      (key) => {
        const h = now.get(key);
        return h && { enHash: h.enHash, frHash: h.frHash, reviewers: [reviewer] };
      },
    );
    writeFileSync(
      files.translations,
      formatJson({ format: 'quest-n-click-docs-translations', version: 1, pairs: records }),
    );
    resolutions.push({ file: 'wiki/translations.json', ...resolution });
  }
  if (reviews) {
    // Claim states read the translations as just written: a clean file.
    const states = new Map(
      checkWiki({ wikiDir: o.wikiDir, tracked: trackedFiles(root), root }).claims.map((c) => [c.id, c]),
    );
    const { records, resolution } = mergeRecords(
      reviews,
      side,
      (id, r) => r.claimTextHash === states.get(id)?.claimTextHash && r.testFileHash === states.get(id)?.testFileHash,
      (id) => {
        const s = states.get(id);
        return s && !s.unreferenced && s.testFileHash
          ? { claimTextHash: s.claimTextHash, testFileHash: s.testFileHash, reviewers: [reviewer] }
          : undefined;
      },
    );
    writeFileSync(files.reviews, formatJson({ format: 'quest-n-click-docs-reviews', version: 1, claims: records }));
    resolutions.push({ file: 'wiki/reviews.json', ...resolution });
  }
  return { resolutions, side: `${side} (${why})`, errors: [] };
}
