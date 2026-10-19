// Comments (4.2.3 PR 3, plan H2): threads anchored on a stable id of the game and the revision they were written at,
// kept by the Studio (`studio_comments`), not in a game file: a reviewer comments without writing the game, and the
// journal stays the game's. A comment whose anchor the game no longer names is said "orphan", never moved elsewhere.
// The notes of `notes.json` come in as comments (an owner's import, each note once).
import { randomUUID } from 'node:crypto';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { Note } from '../../../tools/studio/types';
import { StudioError } from '../ops/errors';

export interface Comment {
  id: string;
  /** A stable id of the game (`hall`, `hall.door`, `item:key`, a rule's id, a storyboard panel's), or '' (the game). */
  anchor: string;
  /** The revision it was written at. */
  rev: number;
  /** The comment it answers, for a thread. */
  parent: string | null;
  author: string;
  text: string;
  resolved: boolean;
  at: number;
  edited: number | null;
  /** The game no longer names its anchor (a room removed, an id renamed): said, never attached elsewhere. */
  orphan: boolean;
}

export interface CommentsOptions {
  db: SqlDb;
  /**
   * The anchors the game names now (the IR's provenance, the storyboard's boards and panels); null when that cannot be
   * read (a game that does not load): no comment is then said orphan.
   */
  known: () => Promise<Set<string> | null>;
  /** The head's revision. */
  revision: () => Promise<number>;
  now?: () => number;
}

const ANCHOR = /^[\w.:@-]{0,200}$/;
const MAX_TEXT = 4_000;

export class Comments {
  private now: () => number;

  constructor(private o: CommentsOptions) {
    this.now = o.now ?? Date.now;
  }

  private shape(r: Record<string, unknown>, known: Set<string> | null): Comment {
    const anchor = String(r.anchor);
    return {
      id: String(r.id),
      anchor,
      rev: Number(r.rev),
      parent: r.parent === null || r.parent === undefined ? null : String(r.parent),
      author: String(r.author),
      text: String(r.text),
      resolved: Number(r.resolved) !== 0,
      at: Number(r.created_at),
      edited: r.edited_at === null || r.edited_at === undefined ? null : Number(r.edited_at),
      orphan: anchor !== '' && known !== null && !known.has(anchor),
    };
  }

  /** Every comment (or those of one anchor), oldest first, each said orphan or not. */
  async list(anchor?: string): Promise<Comment[]> {
    const rows =
      anchor === undefined
        ? await this.o.db.all('SELECT * FROM studio_comments ORDER BY created_at, id')
        : await this.o.db.all('SELECT * FROM studio_comments WHERE anchor = $1 ORDER BY created_at, id', [anchor]);
    const known = await this.o.known();
    return rows.map((r) => this.shape(r, known));
  }

  private async get(id: string): Promise<Record<string, unknown>> {
    const [r] = await this.o.db.all('SELECT * FROM studio_comments WHERE id = $1', [id]);
    if (!r) throw new StudioError(`no comment ${id}`, 404);
    return r;
  }

  /** A comment by `who`, on `anchor` (a reply takes its parent's anchor), at the head's revision. */
  async add(c: { anchor?: unknown; text?: unknown; parent?: unknown }, who: { id: string; name: string }) {
    const text = typeof c.text === 'string' ? c.text.trim() : '';
    if (!text || text.length > MAX_TEXT) throw new StudioError(`a comment is a text of 1 to ${MAX_TEXT} characters`);
    let anchor = typeof c.anchor === 'string' ? c.anchor.trim() : '';
    let parent: string | null = null;
    if (c.parent !== undefined && c.parent !== null) {
      const p = await this.get(String(c.parent));
      // A thread is one level: a reply answers the thread's first comment.
      parent = p.parent === null || p.parent === undefined ? String(p.id) : String(p.parent);
      anchor = String(p.anchor);
    }
    if (!ANCHOR.test(anchor))
      throw new StudioError('an anchor is a stable id of the game (letters, digits, . : @ - _)');
    const id = `c${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await this.o.db.run(
      'INSERT INTO studio_comments (id, anchor, rev, parent, author_id, author, text, resolved, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NULL, $8)',
      [id, anchor, await this.o.revision(), parent, who.id, who.name, text, this.now()],
    );
    return (await this.list(anchor)).find((x) => x.id === id)!;
  }

  /**
   * Its text changed (its author only) or its thread resolved or opened again (its author, or a dev: a reviewer
   * resolves their own threads).
   */
  async update(
    id: string,
    e: { text?: unknown; resolved?: unknown },
    who: { id: string; canResolve: boolean },
  ): Promise<Comment> {
    const r = await this.get(id);
    const mine = String(r.author_id) === who.id;
    if (e.text !== undefined) {
      if (!mine) throw new StudioError("only its author changes a comment's text", 403);
      const text = typeof e.text === 'string' ? e.text.trim() : '';
      if (!text || text.length > MAX_TEXT) throw new StudioError(`a comment is a text of 1 to ${MAX_TEXT} characters`);
      await this.o.db.run('UPDATE studio_comments SET text = $1, edited_at = $2 WHERE id = $3', [text, this.now(), id]);
    }
    if (e.resolved !== undefined) {
      if (typeof e.resolved !== 'boolean') throw new StudioError('`resolved` is true or false');
      if (!mine && !who.canResolve) throw new StudioError('a reviewer resolves their own threads', 403);
      // Resolved as a thread: its first comment carries it.
      const head = r.parent === null || r.parent === undefined ? id : String(r.parent);
      await this.o.db.run('UPDATE studio_comments SET resolved = $1 WHERE id = $2', [e.resolved ? 1 : 0, head]);
    }
    return (await this.list(String(r.anchor))).find((x) => x.id === id)!;
  }

  /** The notes of `notes.json`, each one comment once (its `about` the anchor, free text the game's own thread). */
  async importNotes(notes: Note[], who: { id: string }): Promise<{ imported: number; already: number }> {
    const rev = await this.o.revision();
    let imported = 0;
    let already = 0;
    for (const n of notes) {
      const about = typeof n.about === 'string' ? n.about.trim() : '';
      // A note about free text keeps it at the head of its text, on the game's thread.
      const anchor = ANCHOR.test(about) ? about : '';
      const text = (anchor === about || !about ? n.text : `(${about}) ${n.text}`).slice(0, MAX_TEXT);
      const at = Date.parse(n.at);
      const done = await this.o.db.run(
        'INSERT INTO studio_comments (id, anchor, rev, parent, author_id, author, text, resolved, source, created_at, edited_at) VALUES ($1, $2, $3, NULL, $4, $5, $6, 0, $7, $8, $9) ON CONFLICT (source) DO NOTHING',
        [
          `c${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          anchor,
          rev,
          who.id,
          String(n.author || 'someone'),
          text || '(empty)',
          `note:${n.id}`,
          Number.isFinite(at) ? at : this.now(),
          n.edited && Number.isFinite(Date.parse(n.edited)) ? Date.parse(n.edited) : null,
        ],
      );
      if (done) imported++;
      else already++;
    }
    return { imported, already };
  }
}
