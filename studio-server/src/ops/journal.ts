// The operation journal (4.2.1, plan P1, P5, P6): every write to a game's files is one operation, applied whole or
// not at all, recorded before it touches a file and confirmed after. In local mode the files stay the truth (Git
// reads them): the journal records their hashes, keeps the "after" content of each operation as a blob, and rolls an
// interrupted operation forward when it opens. A change made outside (an editor, an agent, `git checkout`) is adopted
// as an `external` operation before the next one touches the file.
//
// One operation at a time per project: a promise chain inside this process, and a lease row in the database across
// the processes that share it (the dev server, the MCP server, a CLI). The lease is taken on the database's clock.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { migrate } from '../../../bridge/src/migrations';
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import type { BlobStore } from './blobs';
import { ABSENT, hashOnDisk, sha256, sweepTemporaries, writeDurable } from './durable';
import { StudioError } from './errors';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

/** One file an operation writes: its path under the game folder (with `/`) and its whole new content, or `null`. */
export interface FileEffect {
  path: string;
  after: Buffer | string | null;
}

export interface Operation<R> {
  /** Chosen by the client: a retry with the same id gets the recorded response, never a second application. */
  id?: string;
  author: string;
  what: string;
  effects: FileEffect[];
  /** The revision of each file the client read (P5): a file written since by someone else is a 409. */
  base?: Record<string, number>;
  /**
   * The hash (or `ABSENT`) of each file as the operation read it to compute its effects: a file another process
   * wrote meanwhile is a 409, never a lost write.
   */
  expect?: Record<string, string>;
  /** Called once the effects are known to change something, before anything is logged: throws to refuse (P3). */
  guard?: (changed: FileEffect[]) => Promise<void>;
  /** The response recorded with the operation and sent to the client (and again on a retry). */
  respond: (rev: number) => R;
}

export interface Applied<R> {
  response: R;
  /** The revision the operation made, or the head when it changed nothing. */
  rev: number;
  changed: string[];
  replayed?: true;
}

/** What one file was and became in an operation: sha256 or `ABSENT`. */
interface Change {
  path: string;
  before: string;
  after: string;
}

/** The project needs a person: a file matches neither side of an interrupted operation, or the journal is damaged. */
export class MaintenanceError extends StudioError {
  constructor(message: string) {
    super(`maintenance: ${message}`, 503);
  }
}

/** The files of a game the journal follows: every file under the folder but dot-files and leftovers of a write. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

const LEASE_MS = 30_000;

export interface JournalOptions {
  db: SqlDb;
  blobs: BlobStore;
  /** The game folder the journal follows. */
  gameDir: string;
  /** Who holds the lease in this process (default: a random id). */
  holder?: string;
  /** How long an operation waits for another process's lease before a 409 (default 10 s). */
  leaseWaitMs?: number;
}

export class Journal {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly holder: string;

  private constructor(
    private db: SqlDb,
    private blobs: BlobStore,
    readonly gameDir: string,
    holder?: string,
    private leaseWaitMs = 10_000,
  ) {
    this.holder = holder ?? `${process.pid}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Opens the journal of `gameDir`: migrates its database, gives a new project its epoch, rolls forward what an
   * interruption left, sweeps the temporary files, and adopts what changed outside since the last operation.
   */
  static async open(o: JournalOptions): Promise<Journal> {
    await migrate(o.db, { dir: MIGRATIONS });
    await o.db.exec(
      'CREATE TABLE IF NOT EXISTS studio_lease (id INTEGER PRIMARY KEY, holder TEXT NOT NULL, until_ms BIGINT NOT NULL)',
    );
    const j = new Journal(o.db, o.blobs, o.gameDir, o.holder, o.leaseWaitMs);
    await j.serial(async () => {
      await j.withLease(async () => {
        await o.db.tx('studio', async (q) => {
          const [e] = await q.all("SELECT value FROM studio_meta WHERE key = 'epoch'");
          if (!e) {
            await q.run("INSERT INTO studio_meta (key, value) VALUES ('epoch', $1)", [randomUUID()]);
            await q.run("INSERT INTO studio_meta (key, value) VALUES ('revision', '0')");
          }
        });
        await j.recover();
        sweepTemporaries(o.gameDir);
        await j.adopt(null);
      });
    });
    return j;
  }

  // ------------------------------------------------------------------ reading

  async epoch(): Promise<string> {
    const [r] = await this.db.all("SELECT value FROM studio_meta WHERE key = 'epoch'");
    return String(r?.value);
  }

  async revision(): Promise<number> {
    const [r] = await this.db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
    return Number(r?.value ?? 0);
  }

  /** The head of one file: its content hash and the revision that last wrote it (`rev` 0: never written). */
  async file(path: string): Promise<{ blob: string; rev: number }> {
    const [r] = await this.db.all('SELECT blob, rev FROM studio_files WHERE path = $1', [path]);
    return r ? { blob: String(r.blob), rev: Number(r.rev) } : { blob: ABSENT, rev: 0 };
  }

  /** The operations after `rev`, oldest first (P6: a client that reconnects asks for what it missed). */
  async opsAfter(rev: number, limit = 500): Promise<{ id: string; rev: number; author: string; what: string; paths: string[] }[]> {
    const rows = await this.db.all(
      "SELECT op_id, rev, author, what, effects FROM studio_ops WHERE state = 'confirmed' AND rev > $1 ORDER BY rev LIMIT $2",
      [rev, limit],
    );
    return rows.map((r) => ({
      id: String(r.op_id),
      rev: Number(r.rev),
      author: String(r.author),
      what: String(r.what),
      paths: (JSON.parse(String(r.effects)) as Change[]).map((c) => c.path),
    }));
  }

  // ------------------------------------------------------------------ writing

  /** Applies one operation (see the file's head). Operations of this process run one after the other. */
  apply<R>(op: Operation<R>): Promise<Applied<R>> {
    return this.serial(() => this.withLease(() => this.applyNow(op)));
  }

  private async applyNow<R>(op: Operation<R>): Promise<Applied<R>> {
    const id = op.id ?? randomUUID();
    // A retry: the recorded response, never a second application.
    const [seen] = await this.db.all('SELECT state, rev, response, effects FROM studio_ops WHERE op_id = $1', [id]);
    if (seen && String(seen.state) === 'confirmed')
      return {
        response: JSON.parse(String(seen.response)) as R,
        rev: Number(seen.rev),
        changed: (JSON.parse(String(seen.effects)) as Change[]).map((c) => c.path),
        replayed: true,
      };
    if (seen) await this.db.run('DELETE FROM studio_ops WHERE op_id = $1', [id]);

    // What changed outside since the last operation, on the files this one writes, is adopted first.
    await this.adopt(op.effects.map((e) => e.path));

    // The base (P5): a file written since the client read it is a conflict, whoever wrote it.
    for (const [path, rev] of Object.entries(op.base ?? {})) {
      const head = await this.file(path);
      if (head.rev !== rev)
        throw Object.assign(new StudioError(`${path} changed since revision ${rev} (now ${head.rev})`, 409), {
          body: { path, base: rev, head: head.rev },
        });
    }

    const changes: Change[] = [];
    const changed: FileEffect[] = [];
    for (const e of op.effects) {
      const before = hashOnDisk(this.abs(e.path));
      const read = op.expect?.[e.path];
      if (read !== undefined && read !== before)
        throw new StudioError(`${e.path} changed while this edit was being prepared; try again`, 409);
      const after = e.after === null ? ABSENT : sha256(e.after);
      if (before === after) continue;
      changes.push({ path: e.path, before, after });
      changed.push(e);
    }
    const head = await this.revision();
    if (!changes.length) return { response: op.respond(head), rev: head, changed: [] };

    await op.guard?.(changed);

    // The "after" contents first: a recovery rolls forward from them.
    for (const e of changed) if (e.after !== null) await this.blobs.put(Buffer.from(e.after));
    const rev = head + 1;
    const now = Date.now();
    // The intent: logged and on the disk (synchronous = FULL) before any file is touched.
    await this.db.tx('studio', (q) =>
      q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ($1, $2, $3, $4, 'intent', $5, $6)",
        [id, rev, op.author, op.what, JSON.stringify(changes), now],
      ),
    );
    // The befores, kept in memory: an error of this process undoes what it already wrote.
    const befores = new Map<string, Buffer | null>();
    for (const c of changes) {
      const f = this.abs(c.path);
      befores.set(c.path, existsSync(f) ? readFileSync(f) : null);
    }
    const written: string[] = [];
    try {
      for (const e of changed) {
        writeDurable(this.abs(e.path), e.after === null ? null : Buffer.from(e.after));
        written.push(e.path);
      }
    } catch (err) {
      try {
        for (const p of written.reverse()) writeDurable(this.abs(p), befores.get(p) ?? null);
        await this.db.run("UPDATE studio_ops SET state = 'aborted' WHERE op_id = $1", [id]);
      } catch (e2) {
        throw new MaintenanceError(
          `${op.what}: a write failed (${(err as Error).message}) and undoing it failed too (${(e2 as Error).message})`,
        );
      }
      throw err;
    }
    const response = op.respond(rev);
    await this.db.tx('studio', (q) => this.confirm(q, id, rev, changes, response));
    return { response, rev, changed: changes.map((c) => c.path) };
  }

  /** Records a confirmed operation: the head of its files, the project's revision, its response. */
  private async confirm(q: SqlQuery, id: string, rev: number, changes: Change[], response: unknown) {
    for (const c of changes) {
      await q.run('DELETE FROM studio_files WHERE path = $1', [c.path]);
      await q.run('INSERT INTO studio_files (path, blob, rev) VALUES ($1, $2, $3)', [c.path, c.after, rev]);
    }
    await q.run("UPDATE studio_meta SET value = $1 WHERE key = 'revision'", [String(rev)]);
    await q.run("UPDATE studio_ops SET state = 'confirmed', response = $1 WHERE op_id = $2", [
      JSON.stringify(response ?? null),
      id,
    ]);
  }

  /**
   * Adopts as one `external` operation what changed on the disk since the journal last saw it: on `paths`, or on the
   * whole game (`null`). In local mode an editor, an agent or Git may write the files; the journal follows them.
   */
  private async adopt(paths: string[] | null): Promise<void> {
    const files = paths ?? [
      ...new Set([
        ...listFiles(this.gameDir),
        ...(await this.db.all('SELECT path FROM studio_files')).map((r) => String(r.path)),
      ]),
    ];
    const changes: Change[] = [];
    for (const path of files) {
      const disk = hashOnDisk(this.abs(path));
      const head = await this.file(path);
      if (disk !== head.blob) changes.push({ path, before: head.blob, after: disk });
    }
    if (!changes.length) return;
    const rev = (await this.revision()) + 1;
    const id = randomUUID();
    await this.db.tx('studio', async (q) => {
      await q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ($1, $2, 'external', $3, 'intent', $4, $5)",
        [id, rev, paths ? 'changed outside the Studio' : 'the game as found', JSON.stringify(changes), Date.now()],
      );
      await this.confirm(q, id, rev, changes, null);
    });
  }

  /** Rolls forward every operation an interruption left logged but not confirmed (P1). */
  private async recover(): Promise<void> {
    const rows = await this.db.all("SELECT op_id, rev, effects FROM studio_ops WHERE state = 'intent' ORDER BY rev");
    for (const r of rows) {
      const id = String(r.op_id);
      const changes = JSON.parse(String(r.effects)) as Change[];
      for (const c of changes) {
        const file = this.abs(c.path);
        const now = hashOnDisk(file);
        if (now === c.after) continue;
        if (now !== c.before)
          throw new MaintenanceError(
            `operation ${id} (revision ${r.rev}) was interrupted and ${c.path} is neither what it was nor what it became`,
          );
        writeDurable(file, c.after === ABSENT ? null : await this.blobs.get(c.after));
      }
      await this.db.tx('studio', (q) => this.confirm(q, id, Number(r.rev), changes, { recovered: true }));
    }
  }

  // ------------------------------------------------------------------ the lease and the chain

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** The project's write lease across processes, on the database's clock; refused (409) when another holds it. */
  private async withLease<T>(fn: () => Promise<T>): Promise<T> {
    const clock = this.db.dialect === 'postgres' ? '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT' : "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
    const deadline = Date.now() + this.leaseWaitMs;
    for (;;) {
      const got = await this.db.tx('studio', async (q) => {
        const [now] = await q.all(`SELECT ${clock} AS now`);
        const t = Number(now?.now);
        const [cur] = await q.all('SELECT holder, until_ms FROM studio_lease WHERE id = 1');
        if (cur && String(cur.holder) !== this.holder && Number(cur.until_ms) > t) return false;
        await q.run('DELETE FROM studio_lease WHERE id = 1');
        await q.run('INSERT INTO studio_lease (id, holder, until_ms) VALUES (1, $1, $2)', [this.holder, t + LEASE_MS]);
        return true;
      });
      if (got) break;
      if (Date.now() > deadline) throw new StudioError('another process is writing this game; try again', 409);
      await new Promise((ok) => setTimeout(ok, 50));
    }
    try {
      return await fn();
    } finally {
      await this.db.run('DELETE FROM studio_lease WHERE id = 1 AND holder = $1', [this.holder]);
    }
  }

  private abs(path: string): string {
    if (path.startsWith('/') || path.split('/').includes('..')) throw new StudioError(`not a path in the game: "${path}"`);
    return join(this.gameDir, ...path.split('/'));
  }

  async close(): Promise<void> {
    await this.serial(async () => this.db.close());
  }
}
