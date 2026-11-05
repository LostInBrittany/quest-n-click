// The rewrite of the next release's mark (#443, tools/next-mark.ts) with the docs' records carried over: a translation
// pair's side, a claim's text and a claim's test file hashed before the rewrite are given their hash after it, in
// wiki/translations.json, wiki/reviews.json and any pending file still there. Only a record that held the text before
// moves: a stale one stays stale, and nothing becomes reviewed because of the rewrite.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rekey, textHashOf } from './next-mark';
import { claimsOf, claimTextHash, readReviews, writeReviews } from './wiki/claims';
import { type Manifest, readManifest } from './wiki/manifest';
import { parsePage } from './wiki/page';
import { writePending } from './wiki/pending';
import { currentPairHashes, readTranslations, writeTranslations } from './wiki/translations';

/** Each claim's text hash, as a review records it, from the pages as they are on disk. */
function claimHashes(wikiDir: string, manifest: Manifest) {
  const parsed = new Map<string, ReturnType<typeof parsePage>>();
  const blocks = (id: string, lang: 'en' | 'fr') => {
    const file = resolve(wikiDir, lang, `${id}.md`);
    if (!existsSync(file)) return undefined;
    const key = `${lang}/${id}`;
    if (!parsed.has(key)) parsed.set(key, parsePage(readFileSync(file, 'utf8'), lang));
    return parsed.get(key)!.blocks;
  };
  return new Map(claimsOf(manifest, (p, l) => blocks(p.id, l)).map((c) => [c.claim.id, claimTextHash(c)]));
}

function manifestOf(wikiDir: string): Manifest {
  const m = readManifest(wikiDir);
  if (!m.manifest) throw new Error(m.errors.join('\n'));
  return m.manifest;
}

/** Hashes a test file as a claim review records it. */
const fileHash = (text: string) => textHashOf(text.replace(/\r\n/g, '\n'));

/**
 * Writes the rewritten files (`changed`, from `tools/next-mark.ts`) and carries the records over. Returns how many
 * hashes moved.
 */
export function rewriteWithRecords(root: string, changed: readonly { path: string; before: string; after: string }[]) {
  const wikiDir = resolve(root, 'wiki');
  const before = {
    pairs: currentPairHashes(wikiDir, manifestOf(wikiDir)),
    claims: claimHashes(wikiDir, manifestOf(wikiDir)),
  };
  const files = new Map(changed.map((c) => [fileHash(c.before), fileHash(c.after)]));
  for (const c of changed) writeFileSync(resolve(root, c.path), c.after);
  const manifest = manifestOf(wikiDir);
  const after = { pairs: currentPairHashes(wikiDir, manifest), claims: claimHashes(wikiDir, manifest) };

  const pairFields = (['enHash', 'frHash'] as const).map((field) => ({
    field,
    before: (key: string) => before.pairs.get(key)?.[field],
    after: (key: string) => after.pairs.get(key)?.[field],
  }));
  const claimFields = [
    {
      field: 'claimTextHash' as const,
      before: (id: string) => before.claims.get(id),
      after: (id: string) => after.claims.get(id),
    },
    {
      field: 'testFileHash' as const,
      before: (_id: string, r: { testFileHash: string }) => (files.has(r.testFileHash) ? r.testFileHash : undefined),
      after: (_id: string, r: { testFileHash: string }) => files.get(r.testFileHash),
    },
  ];

  const { translations } = readTranslations(wikiDir);
  const { reviews } = readReviews(wikiDir);
  const pairs = rekey(translations.pairs, pairFields);
  const claims = rekey(reviews.claims, claimFields);
  writeTranslations(wikiDir, pairs.records);
  writeReviews(wikiDir, claims.records);
  const moved = { pairs: pairs.moved, claims: claims.moved };
  // A pending file still there (the fold runs first in prepare; by hand it may not have).
  for (const p of translations.pending) {
    const pp = rekey(p.pairs, pairFields);
    const pc = rekey(reviews.pending.find((r) => r.file === p.file)?.claims ?? p.claims, claimFields);
    moved.pairs += pp.moved;
    moved.claims += pc.moved;
    const { file, ...rest } = p;
    writePending(resolve(root, file), { ...rest, pairs: pp.records, claims: pc.records });
  }
  return moved;
}
