// What `wiki -- check --publish` adds about the source set (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.2 and
// §4.5.3, phase A5): published documentation names exactly one published product. The documentation's revision
// (`--doc-ref`, HEAD by default) descends from the product's (`--product-ref`, a tag or a SHA), and what it changed
// since is documentation only: `wiki/<lang>/*.md`, `wiki/manifest.json`, `wiki/translations.json`,
// `wiki/reviews.json` and `wiki/images/**`, no code and no generator. `--released` refuses a page or a section whose
// `appliesFrom` is after the product's version (read from its `package.json` at the product ref). The bootstrap's one
// exception, a `preview` publication of an unreleased 4.5.0, is refused once a release tag `v4.5.0` or later exists.
import { execFileSync } from 'node:child_process';
import { compareVersions } from './docs';
import { SEMVER } from './page';

/** The paths a documentation revision may change after its product's commit (§4.5.2). */
const DOC_ONLY = /^wiki\/((en|fr)\/[^/]+\.md|manifest\.json|translations\.json|reviews\.json|images\/.+)$/;
/** The release from which a `preview` publication is refused (§4.5.3). */
const BOOTSTRAP_UNTIL = '4.5.0';

const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The full SHA of a ref's commit, or undefined when git does not know it. */
export function commitOf(root: string, ref: string): string | undefined {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) || undefined;
  } catch {
    return undefined;
  }
}

/** The product's version at a commit: its `package.json`'s. */
export function versionAt(root: string, commit: string): string | undefined {
  try {
    const v = (JSON.parse(git(root, ['show', `${commit}:package.json`])) as { version?: unknown }).version;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The source-set rule: the doc revision descends from the product's commit, and the files changed between them are
 * documentation only. Returns the problems, each a sentence.
 */
export function sourceSetProblems(root: string, product: string, doc: string): string[] {
  if (product === doc) return [];
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', product, doc], { cwd: root, stdio: 'ignore' });
  } catch {
    return [`the doc revision ${doc.slice(0, 12)} does not descend from the product commit ${product.slice(0, 12)}`];
  }
  const changed = git(root, ['diff', '--name-only', product, doc]).split('\n').filter(Boolean);
  const outside = changed.filter((f) => !DOC_ONLY.test(f));
  return outside.length
    ? [
        `the doc revision changes ${outside.length} file(s) outside the documentation since the product commit (only wiki/<lang>/*.md, wiki/manifest.json, wiki/translations.json, wiki/reviews.json and wiki/images/** may change): ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? '…' : ''}`,
      ]
    : [];
}

/** The releases a repository has tagged, `v<semver>` without pre-release, newest last. */
function releaseTags(root: string): string[] {
  let out: string;
  try {
    out = git(root, ['tag', '-l', 'v*']);
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map((t) => t.trim().slice(1))
    .filter((v) => SEMVER.test(v) && !v.includes('-'))
    .sort(compareVersions);
}

/** Why a `preview` publication is refused: a release at or after 4.5.0 exists (the bootstrap happens once). */
export function previewProblem(root: string): string | undefined {
  const after = releaseTags(root).filter((v) => compareVersions(v, BOOTSTRAP_UNTIL) >= 0);
  return after.length
    ? `--state preview is the bootstrap's one exception (§4.5.3), refused once a release ${BOOTSTRAP_UNTIL} or later exists: v${after.at(-1)} does`
    : undefined;
}
