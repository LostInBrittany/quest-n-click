// The journal shipped (4.2.2 PR 7, plan §2.7, G7): each confirmed operation is copied, asynchronously, to an immutable
// segment of the bucket (`journal/<epoch>/<rev>.json`: the operation's row, its effects' hashes; the contents are
// blobs already), in order, a watermark kept in `studio_meta` (`shipped`). The RPO is the age of the oldest confirmed
// operation not shipped yet (0 when none): measured, given by `/readyz`, never claimed to be nil. A restore replays
// the segments past its backup's revision: the operations, and the head they made.
import type { SqlDb, SqlQuery } from '../../../bridge/src/store-sql';
import { ABSENT } from './durable';

export interface Segments {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  list(prefix: string): AsyncIterable<{ key: string }>;
}

const keyOf = (epoch: string, rev: number) => `journal/${epoch}/${String(rev).padStart(12, '0')}.json`;

interface Shipped {
  op_id: string;
  rev: number;
  author: string;
  what: string;
  effects: string;
  at: number;
}

export class Shipper {
  private running: Promise<void> | null = null;
  private wanted = false;
  private now: () => number;

  constructor(
    private o: { db: SqlDb; segments: Segments; log?: (line: Record<string, unknown>) => void; now?: () => number },
  ) {
    this.now = o.now ?? Date.now;
  }

  private async meta(q: SqlQuery, key: string): Promise<string | undefined> {
    const [r] = await q.all('SELECT value FROM studio_meta WHERE key = $1', [key]);
    return r ? String(r.value) : undefined;
  }

  /** Ships what is confirmed and not shipped yet, in order (after each confirmed operation, at start). */
  ship(): Promise<void> {
    this.wanted = true;
    this.running ??= (async () => {
      while (this.wanted) {
        this.wanted = false;
        try {
          await this.once();
        } catch (e) {
          // Tried again at the next operation: the RPO says how far behind it is meanwhile.
          this.o.log?.({ event: 'ship-failed', message: String((e as Error).message).slice(0, 300) });
        }
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async once() {
    const epoch = (await this.meta(this.o.db, 'epoch')) ?? '';
    const shipped = Number((await this.meta(this.o.db, 'shipped')) ?? 0);
    const ops = await this.o.db.all(
      "SELECT op_id, rev, author, what, effects, at FROM studio_ops WHERE state = 'confirmed' AND rev > $1 ORDER BY rev LIMIT 500",
      [shipped],
    );
    for (const r of ops) {
      const op: Shipped = {
        op_id: String(r.op_id),
        rev: Number(r.rev),
        author: String(r.author),
        what: String(r.what),
        effects: String(r.effects),
        at: Number(r.at),
      };
      await this.o.segments.put(keyOf(epoch, op.rev), Buffer.from(JSON.stringify({ v: 1, epoch, op })));
      await this.o.db.run(
        "INSERT INTO studio_meta (key, value) VALUES ('shipped', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [String(op.rev)],
      );
    }
    if (ops.length === 500) this.wanted = true;
  }

  /** The age of the oldest confirmed operation not shipped yet, in ms (0: everything is shipped). */
  async rpoMs(): Promise<number> {
    const shipped = Number((await this.meta(this.o.db, 'shipped')) ?? 0);
    const [r] = await this.o.db.all("SELECT MIN(at) AS at FROM studio_ops WHERE state = 'confirmed' AND rev > $1", [
      shipped,
    ]);
    return r?.at === null || r?.at === undefined ? 0 : Math.max(0, this.now() - Number(r.at));
  }
}

/**
 * After a restore: the segments of the backup's epoch past its revision, applied in order (each operation's row, its
 * effects on the head, the revision), stopping at a gap. Returns the last revision replayed.
 */
export async function replaySegments(db: SqlDb, segments: Segments, from: { epoch: string; revision: number }) {
  const keys: string[] = [];
  for await (const s of segments.list(`journal/${from.epoch}/`)) keys.push(s.key);
  keys.sort();
  let rev = from.revision;
  for (const key of keys) {
    const at = Number(/(\d+)\.json$/.exec(key)?.[1] ?? Number.NaN);
    if (!(at > rev)) continue;
    if (at !== rev + 1) break; // a gap: what follows cannot be applied in order
    const body = await segments.get(key);
    if (!body) break;
    const { epoch, op } = JSON.parse(body.toString('utf8')) as { epoch: string; op: Shipped };
    if (epoch !== from.epoch || op.rev !== at) break;
    await db.tx('studio', async (q) => {
      await q.run(
        "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, response, at) VALUES ($1, $2, $3, $4, 'confirmed', $5, NULL, $6)",
        [op.op_id, op.rev, op.author, op.what, op.effects, op.at],
      );
      for (const e of JSON.parse(op.effects) as { path: string; after: string }[])
        await q.run(
          'INSERT INTO studio_files (path, blob, rev) VALUES ($1, $2, $3) ON CONFLICT (path) DO UPDATE SET blob = excluded.blob, rev = excluded.rev',
          [e.path, e.after === ABSENT ? ABSENT : e.after, op.rev],
        );
      await q.run("UPDATE studio_meta SET value = $1 WHERE key = 'revision'", [String(op.rev)]);
    });
    rev = at;
  }
  return rev;
}
