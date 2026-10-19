// The game to and from a Git repository (4.2.3 PR 6, plan H5, D44: a deploy key, one repository per instance). A push is
// one commit for the revisions confirmed since the last push, the game's files at the head, every author of those
// revisions a `Co-authored-by`; it never rewrites the remote's history: a branch that moved since the last push, or one
// the Studio never saw, is refused (409), never forced. An import reads a commit and writes the game as it is there in
// one operation, under the project's exclusive lease; the next push builds on it. Git runs with an environment of its
// own (no secret of the platform), the deploy key in a 0600 file for the run only.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { sha256 } from '../ops/durable';
import { StudioError } from '../ops/errors';

export interface GitConfig {
  /** The repository: `git@github.com:org/game.git`, `https://…` (public), `file://…` (tests). */
  remote: string;
  /** Default `main`. */
  branch?: string;
  /** The game's folder in the repository (`games/my-game`); default its root. */
  path?: string;
  /** Who commits (the authors are `Co-authored-by`). */
  committer?: { name: string; email: string };
}

export interface GitSyncOptions {
  db: SqlDb;
  blobs: BlobStore;
  gameDir: string;
  config: GitConfig;
  /** Where the clone lives (ephemeral: cloned again when missing). */
  workDir: string;
  /** The deploy key (a private key, PEM or OpenSSH), when the remote needs one. */
  key?: string;
  /** Writes files as one operation (the Studio core's `writeFiles`). */
  writeFiles: (what: string, files: { path: string; after: Buffer | null }[]) => Promise<unknown>;
  /** Runs under the project's exclusive lease. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The `git` binary (default `git` on the PATH). */
  git?: string;
  log?: (line: Record<string, unknown>) => void;
}

const MAX_FILES = 5_000;
const MAX_BYTES = 64 * 1024 * 1024;
const REF = /^(?![-./])(?!.*\.\.)[\w./-]{1,100}$/;

export class GitSync {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly branch: string;
  private readonly prefix: string;

  constructor(private o: GitSyncOptions) {
    this.branch = o.config.branch ?? 'main';
    if (!REF.test(this.branch)) throw new Error(`git.branch "${this.branch}" is not a branch name`);
    this.prefix = (o.config.path ?? '').replace(/^\/+|\/+$/g, '');
    if (this.prefix.split('/').some((s) => s === '..' || s === '.'))
      throw new Error('git.path stays in the repository');
  }

  /** One at a time: a push and an import never overlap. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async meta(key: string): Promise<string | undefined> {
    const [r] = await this.o.db.all('SELECT value FROM studio_meta WHERE key = $1', [key]);
    return r ? String(r.value) : undefined;
  }

  private async setMeta(values: Record<string, string>) {
    await this.o.db.tx('studio', async (q) => {
      for (const [key, value] of Object.entries(values))
        await q.run(
          'INSERT INTO studio_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
    });
  }

  /** Git in the clone, with its own environment: the deploy key for this run only, no prompt, no user config. */
  private async git(args: string[], o: { allowFail?: boolean } = {}): Promise<{ out: string; code: number }> {
    const keyFile = join(this.o.workDir, 'deploy-key');
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: this.o.workDir,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(this.o.workDir, 'gitconfig'),
    };
    if (this.o.key) {
      writeFileSync(keyFile, this.o.key.endsWith('\n') ? this.o.key : `${this.o.key}\n`, { mode: 0o600 });
      env.GIT_SSH_COMMAND = `ssh -i ${keyFile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${join(this.o.workDir, 'known_hosts')}`;
    }
    try {
      return await new Promise((ok, ko) =>
        execFile(
          this.o.git ?? 'git',
          args,
          { cwd: join(this.o.workDir, 'repo'), env, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' },
          (e, stdout, stderr) => {
            const code = e ? Number((e as { code?: number }).code ?? 1) : 0;
            if (code && !o.allowFail)
              return ko(new Error(`git ${args[0]}: ${String(stderr).trim().split('\n').slice(-2).join(' ')}`));
            ok({ out: String(stdout), code });
          },
        ),
      );
    } finally {
      if (this.o.key) rmSync(keyFile, { force: true });
    }
  }

  /** The clone, made when missing, fetched; the remote branch's tip, or undefined when it does not exist yet. */
  private async fetch(): Promise<string | undefined> {
    const repo = join(this.o.workDir, 'repo');
    if (!existsSync(join(repo, '.git'))) {
      mkdirSync(repo, { recursive: true });
      await this.git(['init', '-q']);
      await this.git(['remote', 'add', 'origin', this.o.config.remote]);
    }
    await this.git(['fetch', '-q', '--prune', 'origin'], { allowFail: false });
    const tip = await this.git(['rev-parse', '-q', '--verify', `refs/remotes/origin/${this.branch}^{commit}`], {
      allowFail: true,
    });
    return tip.code ? undefined : tip.out.trim();
  }

  /** The game at the head: its files by path, each checked against its hash. */
  private async head(): Promise<{ revision: number; files: Map<string, Buffer> }> {
    const rows = await this.o.db.tx(
      undefined,
      async (q) => ({
        files: await q.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path"),
        rev: (await q.all("SELECT value FROM studio_meta WHERE key = 'revision'"))[0]?.value,
      }),
      { readOnly: true },
    );
    const files = new Map<string, Buffer>();
    for (const r of rows.files) {
      const path = String(r.path);
      const blob = String(r.blob);
      const bytes = (await this.o.blobs.has(blob))
        ? await this.o.blobs.get(blob)
        : readFileSync(join(this.o.gameDir, ...path.split('/')));
      if (sha256(bytes) !== blob) throw new StudioError(`${path}: the folder does not match the head; try again`, 409);
      files.set(path, bytes);
    }
    return { revision: Number(rows.rev ?? 0), files };
  }

  /** Where the game is in the clone. */
  private here(path = '') {
    return join(
      this.o.workDir,
      'repo',
      ...(this.prefix ? this.prefix.split('/') : []),
      ...path.split('/').filter(Boolean),
    );
  }

  /** What the Studio knows of the repository. */
  async status() {
    return {
      remote: this.o.config.remote.replace(/\/\/[^@/]*@/, '//'),
      branch: this.branch,
      path: this.prefix,
      pushed: Number((await this.meta('git_pushed')) ?? 0) || null,
      commit: (await this.meta('git_commit')) ?? null,
    };
  }

  /**
   * One commit of the revisions confirmed since the last push, on the branch's tip the Studio knows; refused (409) when
   * the branch moved since, or exists and the Studio never imported or pushed it. Nothing new: nothing pushed.
   */
  push(): Promise<{ pushed: boolean; commit: string | null; revisions: [number, number] | null }> {
    return this.serial(async () => {
      const tip = await this.fetch();
      const known = await this.meta('git_commit');
      if (tip && tip !== known)
        throw new StudioError(
          known
            ? `${this.branch} moved since the Studio's last push (${known.slice(0, 12)} → ${tip.slice(0, 12)}): import it first, never forced`
            : `${this.branch} exists and the Studio never imported it: import it first, or push to a new branch`,
          409,
        );
      const head = await this.head();
      const from = Number((await this.meta('git_pushed')) ?? 0);
      if (tip) await this.git(['checkout', '-q', '-f', '-B', this.branch, tip]);
      else {
        await this.git(['checkout', '-q', '-f', '--orphan', this.branch]);
        await this.git(['rm', '-q', '-r', '-f', '--cached', '--ignore-unmatch', '.']);
      }
      // The game's folder in the clone: exactly the head.
      const tracked = (await this.git(['ls-files', '-z', '--', this.prefix || '.'])).out.split('\0').filter(Boolean);
      for (const t of tracked) {
        const rel = this.prefix ? t.slice(this.prefix.length + 1) : t;
        if (!head.files.has(rel)) rmSync(join(this.o.workDir, 'repo', ...t.split('/')), { force: true });
      }
      for (const [path, bytes] of head.files) {
        const file = this.here(path);
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, bytes);
      }
      await this.git(['add', '-A', '--', this.prefix || '.']);
      const changed = (await this.git(['diff', '--cached', '--quiet'], { allowFail: true })).code !== 0;
      if (!changed) {
        await this.setMeta({ git_pushed: String(head.revision), ...(tip ? { git_commit: tip } : {}) });
        return { pushed: false, commit: tip ?? null, revisions: null };
      }
      const ops = await this.o.db.all(
        "SELECT rev, author, what FROM studio_ops WHERE state = 'confirmed' AND rev > $1 AND rev <= $2 ORDER BY rev",
        [from, head.revision],
      );
      const authors = [...new Set(ops.map((r) => String(r.author)))].filter((a) => a !== 'external');
      const who = this.o.config.committer ?? { name: 'web-scumm Studio', email: 'studio@web-scumm.invalid' };
      const message = [
        `Studio revisions ${from + 1}–${head.revision}`,
        '',
        ...ops.slice(0, 200).map((r) => `- r${r.rev} ${String(r.what).slice(0, 120)} (${String(r.author)})`),
        ...(ops.length > 200 ? [`- … ${ops.length - 200} more`] : []),
        '',
        ...authors.map((a) => `Co-authored-by: ${coAuthor(a)}`),
      ].join('\n');
      await this.git([
        '-c',
        `user.name=${who.name}`,
        '-c',
        `user.email=${who.email}`,
        'commit',
        '-q',
        '--no-verify',
        '-m',
        message,
      ]);
      const commit = (await this.git(['rev-parse', 'HEAD'])).out.trim();
      // Never forced: a branch that moved meanwhile refuses it, and the clone is fetched again next time.
      const pushed = await this.git(['push', '-q', 'origin', `HEAD:refs/heads/${this.branch}`], { allowFail: true });
      if (pushed.code) throw new StudioError(`${this.branch} moved while pushing: import it first, never forced`, 409);
      await this.setMeta({ git_pushed: String(head.revision), git_commit: commit });
      this.o.log?.({ event: 'git-pushed', commit, revisions: [from + 1, head.revision] });
      return { pushed: true, commit, revisions: [from + 1, head.revision] };
    });
  }

  /**
   * The game as it is at `ref` (the branch by default, or a commit), written as one operation under the exclusive lease;
   * the branch's next push builds on that commit. A file the game cannot hold refuses the whole import.
   */
  import(ref?: string): Promise<{ commit: string; changed: number }> {
    if (ref !== undefined && !REF.test(ref)) throw new StudioError('ref must be a branch name or a commit');
    return this.serial(() =>
      this.o.exclusive(async () => {
        const tip = await this.fetch();
        const want = ref ?? (tip ? `refs/remotes/origin/${this.branch}` : undefined);
        if (!want) throw new StudioError(`${this.branch} does not exist in the repository`, 404);
        const at = await this.git(['rev-parse', '-q', '--verify', `${want}^{commit}`], { allowFail: true });
        if (at.code) throw new StudioError(`no commit ${ref} in the repository`, 404);
        const commit = at.out.trim();
        await this.git(['checkout', '-q', '-f', '--detach', commit]);
        await this.git(['clean', '-q', '-f', '-d', '-x']);
        const theirs = new Map<string, Buffer>();
        let bytes = 0;
        const root = this.here();
        const walk = (d: string) => {
          if (!existsSync(d)) return;
          for (const n of readdirSync(d)) {
            if (n === '.git' || n.startsWith('.')) continue;
            const f = join(d, n);
            if (statSync(f).isDirectory()) walk(f);
            else {
              if (theirs.size >= MAX_FILES) throw new StudioError(`more than ${MAX_FILES} files to import`, 413);
              const b = readFileSync(f);
              bytes += b.length;
              if (bytes > MAX_BYTES) throw new StudioError('more than 64 MiB to import', 413);
              theirs.set(relative(root, f).split(sep).join('/'), b);
            }
          }
        };
        walk(root);
        if (!theirs.size) throw new StudioError(`the commit holds no game at "${this.prefix || '/'}"`, 422);
        const head = await this.head();
        const files: { path: string; after: Buffer | null }[] = [];
        for (const [path, b] of theirs) if (!head.files.get(path)?.equals(b)) files.push({ path, after: b });
        for (const path of head.files.keys()) if (!theirs.has(path)) files.push({ path, after: null });
        if (files.length) await this.o.writeFiles(`import from git ${commit.slice(0, 12)}`, files);
        const [r] = await this.o.db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
        const onBranch = tip === commit;
        await this.setMeta({
          git_pushed: String(r?.value ?? 0),
          ...(onBranch ? { git_commit: commit } : {}),
        });
        this.o.log?.({ event: 'git-imported', commit, files: files.length });
        return { commit, changed: files.length };
      }),
    );
  }
}

/** An author as a trailer: their email when they are named by it, else their name at a mailbox that never exists. */
function coAuthor(a: string): string {
  const clean = a.replace(/[<>\n\r]/g, '').trim() || 'someone';
  return clean.includes('@')
    ? `${clean.split('@')[0]} <${clean}>`
    : `${clean} <${clean.replace(/\W+/g, '.')}@users.web-scumm.invalid>`;
}
