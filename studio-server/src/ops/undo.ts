// Personal undo and redo (4.2.2 PR 4, plan §2.4, G5): on a shared Studio, a member undoes only their own operations,
// in their order, whatever the others wrote meanwhile. An undo is a new operation of the journal (its inverse: each
// file back to its content before), a redo another (each file back to its content after); history is never
// rewritten. It is refused (409) when another write changed one of its files since, and (423, by the spans' claim)
// when the member no longer holds a file's span. Kept in the database, by member and epoch: a restart, another
// instance, another tab of the same member see the same stacks. A new undoable edit of the member drops their redo.
import type { SqlDb } from '../../../bridge/src/store-sql';

export type UndoDir = 'undo' | 'redo';

export class PersonalUndo {
  constructor(
    private db: SqlDb,
    private epoch: () => Promise<string>,
    private now: () => number = Date.now,
  ) {}

  /** After an undoable operation of `user` made revision `rev`: undoable, and their redo dropped. */
  async recorded(user: string, rev: number, what: string): Promise<void> {
    const epoch = await this.epoch();
    await this.db.tx('studio-undo', async (q) => {
      await q.run("UPDATE studio_undo SET state = 'gone' WHERE epoch = $1 AND user_id = $2 AND state = 'undone'", [
        epoch,
        user,
      ]);
      await q.run(
        "INSERT INTO studio_undo (epoch, rev, user_id, what, state, at) VALUES ($1, $2, $3, $4, 'done', $5) ON CONFLICT DO NOTHING",
        [epoch, rev, user, what, this.now()],
      );
    });
  }

  /** The operation `user` would undo (their latest done) or redo (their latest undone), or undefined. */
  async next(user: string, dir: UndoDir): Promise<{ rev: number; what: string } | undefined> {
    const epoch = await this.epoch();
    const [r] = await this.db.all(
      dir === 'undo'
        ? "SELECT rev, what FROM studio_undo WHERE epoch = $1 AND user_id = $2 AND state = 'done' ORDER BY rev DESC LIMIT 1"
        : "SELECT rev, what FROM studio_undo WHERE epoch = $1 AND user_id = $2 AND state = 'undone' ORDER BY at DESC, rev ASC LIMIT 1",
      [epoch, user],
    );
    return r ? { rev: Number(r.rev), what: String(r.what) } : undefined;
  }

  /** Once the inverse (or the redo) is applied: the operation moves to the other stack. */
  async moved(rev: number, dir: UndoDir): Promise<void> {
    const epoch = await this.epoch();
    await this.db.run('UPDATE studio_undo SET state = $1, at = $2 WHERE epoch = $3 AND rev = $4', [
      dir === 'undo' ? 'undone' : 'done',
      this.now(),
      epoch,
      rev,
    ]);
  }

  /** What `user` can undo and redo, latest first (the Studio's menu). */
  async history(user: string): Promise<{ undo: string[]; redo: string[] }> {
    const epoch = await this.epoch();
    const rows = await this.db.all(
      "SELECT what, state FROM studio_undo WHERE epoch = $1 AND user_id = $2 AND state <> 'gone' ORDER BY rev DESC LIMIT 400",
      [epoch, user],
    );
    return {
      undo: rows.filter((r) => r.state === 'done').map((r) => String(r.what)),
      redo: rows.filter((r) => r.state === 'undone').map((r) => String(r.what)),
    };
  }
}
