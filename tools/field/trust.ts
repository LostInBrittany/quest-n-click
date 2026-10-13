// Who approved a carry (4.1.20 PR 4, docs/dev/PLAN-4.1.20-LAST-MILE.md §9.3, ADR 0024). The trust root is
// `.github/allowed_signers` **as the source candidate's commit holds it** (attested already), never as the commit that
// brings the attestation: a pull request cannot add a key and sign with it. That commit must be on the first-parent
// line of the history judged (main's: every candidate a tag stands on is a commit of it), so an attestation cannot
// name a commit of its own branch as its root (second reading of PR 4: a key added then removed in one branch).
// Every commit that introduced or changed the file, through merges that were not squashed, is checked: signed by a key
// that root names (a signed merge does not cover an unsigned commit it brings), and never touching the root itself.
// The principal of the last one is who approved it. The bytes judged are the committed ones, never the working tree's.
// A key rotation is its own pull request, then a candidate that attests it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SIGNERS = '.github/allowed_signers';
export const CARRY_DIR = 'docs/dev/passes/carry/';

const git = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** The principal git found for a commit signed by a key of `signers`, or why not. */
function signer(cwd: string, commit: string, signers: string): { principal: string } | { why: string } {
  const r = git(cwd, ['-c', `gpg.ssh.allowedSignersFile=${signers}`, 'verify-commit', commit]);
  const said = `${r.stdout}\n${r.stderr}`;
  const good = /Good "git" signature for (\S+) with/.exec(said);
  if (r.status === 0 && good) return { principal: good[1]! };
  return {
    why: /no signature found/i.test(said)
      ? `${commit.slice(0, 12)} is not signed`
      : `${commit.slice(0, 12)}: its signature is not a key the source candidate's ${SIGNERS} names`,
  };
}

/**
 * Who signed every change of `path` (an attestation, or the report beside it), judged by the trust root of
 * `sourceCommit`, in the history of `head`. `ok` with the principal of the last change and the file's bytes at `head`,
 * or why not.
 */
export function trustedApproval(o: {
  repo: string;
  path: string;
  sourceCommit: string;
  head?: string;
}): { ok: true; principal: string; bytes: string } | { ok: false; why: string } {
  const head = o.head ?? 'HEAD';
  if (!/^[0-9a-f]{40}$/.test(o.sourceCommit)) return { ok: false, why: `${o.sourceCommit}: not a full commit` };
  const line = git(o.repo, ['rev-list', '--first-parent', head]);
  if (line.status !== 0 || !line.stdout.split('\n').includes(o.sourceCommit))
    return {
      ok: false,
      why: `the source candidate ${o.sourceCommit.slice(0, 12)} is not on the first-parent line of ${head}: no trust root`,
    };
  const root = git(o.repo, ['show', `${o.sourceCommit}:${SIGNERS}`]);
  if (root.status !== 0 || !root.stdout.trim())
    return { ok: false, why: `the source candidate ${o.sourceCommit.slice(0, 12)} holds no ${SIGNERS}: no trust root` };
  const dir = mkdtempSync(join(tmpdir(), 'carry-trust-'));
  try {
    const signers = join(dir, 'allowed_signers');
    writeFileSync(signers, root.stdout);
    // Every commit that wrote it, through the merges (`--full-history`), the merges themselves left out: GitHub signs a
    // merge with its own key, which the root never names. A merge that changed the file is caught below instead: the
    // file as `head` holds it must be the very bytes its last signed commit wrote.
    const log = git(o.repo, ['log', '--format=%H', '--full-history', '--no-merges', head, '--', o.path]);
    const commits = log.stdout.split('\n').filter(Boolean);
    if (log.status !== 0 || !commits.length) return { ok: false, why: `${o.path}: no commit brings it` };
    let last = '';
    for (const c of commits) {
      const touched = git(o.repo, ['show', '--format=', '--name-only', c]).stdout.split('\n');
      if (touched.includes(SIGNERS))
        return { ok: false, why: `${c.slice(0, 12)} changes ${SIGNERS} and the attestation together` };
      const s = signer(o.repo, c, signers);
      if ('why' in s) return { ok: false, why: s.why };
      if (!last) last = s.principal;
    }
    const atHead = git(o.repo, ['show', `${head}:${o.path}`]);
    const atLast = git(o.repo, ['show', `${commits[0]}:${o.path}`]);
    if (atHead.status !== 0 || atLast.status !== 0) return { ok: false, why: `${o.path}: not in ${head}` };
    if (atHead.stdout !== atLast.stdout)
      return { ok: false, why: `${o.path} was changed by a merge, not by a signed commit` };
    return { ok: true, principal: last, bytes: atHead.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * What is wrong with a range of commits (a pull request): one that changes the trust root and an attestation, in any
 * of its commits (not only the net diff: a key added then removed, and an attestation signed with it in between, nets
 * to nothing). `a...b` is the pull request's own commits, from their merge base.
 */
export function rangeProblems(repo: string, range: string): string[] {
  const [a, b] = range.includes('...') ? range.split('...') : range.split('..');
  const base = range.includes('...') ? git(repo, ['merge-base', a!, b!]).stdout.trim() : a!;
  const commits = git(repo, ['rev-list', `${base}..${b}`])
    .stdout.split('\n')
    .filter(Boolean);
  const files = new Set<string>();
  for (const c of commits)
    for (const f of git(repo, ['show', '--format=', '--name-only', '-m', c]).stdout.split('\n')) if (f) files.add(f);
  // The attestations (`<release>/<pass>.json` and their reports), not the folder's README.
  return files.has(SIGNERS) && [...files].some((f) => f.startsWith(CARRY_DIR) && f.endsWith('.json'))
    ? [`${range} changes ${SIGNERS} and ${CARRY_DIR}: a key is rotated in a pull request of its own`]
    : [];
}
