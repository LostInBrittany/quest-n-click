// `{ seen: key }` checked against what the game records (#248). A topic, a `once` listener or a `once` choice option
// with an id is recorded under its id (`topic.<id>`, `event.<id>`, `choice.<id>`), one without under its place
// (src/engine/core/keys.ts). A key nothing records is never true; the old place of something that now has an id is
// the usual mistake (the 3.x pages wrote `<room>.<actor>.<i>`), so the error names the key to write instead.
import { cmdLists, eachCmd } from '../../core/cmds';
import { seenKey } from '../../core/keys';
import type { GameDef, Id } from '../../core/types';

/** What the game records in `seen`, and the old place of each thing that has an id → its key. */
interface SeenKeys {
  keys: Set<string>;
  moved: Map<string, string>;
  /** The texts of `once` options without an id in game-level lists: recorded in whatever room they run. */
  anyRoomChoices: Set<string>;
}

/** The keys of topics, listeners and Reality signals; the choices are added by `recordChoice` as the walk meets them. */
function seenKeys(game: GameDef): SeenKeys {
  const out: SeenKeys = { keys: new Set(), moved: new Map(), anyRoomChoices: new Set() };
  const record = (key: string, place: string) => {
    out.keys.add(key);
    if (key !== place) out.moved.set(place, key);
  };
  for (const r of game.rooms) {
    for (const [actor, topics] of Object.entries(r.talk ?? {}))
      topics.forEach((t, i) => record(seenKey.topic(t, r.id, actor, i), seenKey.topic({}, r.id, actor, i)));
    (r.events ?? []).forEach((ev, i) => {
      if (ev.once) record(seenKey.event(ev, r.id, i), seenKey.event({}, r.id, i));
    });
  }
  (game.events ?? []).forEach((ev, i) => {
    if (ev.once) record(seenKey.event(ev, 'game', i), seenKey.event({}, 'game', i));
  });
  for (const s of game.reality?.signals ?? []) if (s.once !== false) out.keys.add(seenKey.reality(s.id));
  return out;
}

/** Records the `once` options of a choice met while walking the commands (`room`: undefined at game level). */
function recordChoice(out: SeenKeys, options: { id?: Id; text: string; once?: boolean }[], room: Id | undefined): void {
  for (const o of options) {
    if (!o.once) continue;
    if (room) {
      const key = seenKey.choice(o, room);
      out.keys.add(key);
      const place = seenKey.choice({ text: o.text }, room);
      if (key !== place) out.moved.set(place, key);
    } else if (o.id) out.keys.add(seenKey.choiceOf(o.id));
    else out.anyRoomChoices.add(o.text);
  }
}

/** Why `{ seen: key }` can never be true, or null when the game records that key. */
function seenKeyProblem(known: SeenKeys, key: string): string | null {
  if (known.keys.has(key)) return null;
  if (key.startsWith('choice.')) for (const t of known.anyRoomChoices) if (key.endsWith(`.${t}`)) return null;
  const moved = known.moved.get(key);
  if (moved) return `seen key "${key}" is never recorded: this has an id, write { seen: '${moved}' }`;
  return (
    `seen key "${key}" is never recorded: no topic, \`once\` listener, \`once\` choice option or Reality signal ` +
    'has this key (`topic.<id>`, `event.<id>`, `choice.<id>`, `reality.<signal>`; by place without an id)'
  );
}

/** The validator's side: keys read while walking, checked at the end, once every `once` choice option is known. */
export function seenTracker(game: GameDef) {
  const known = seenKeys(game);
  const read: [key: string, where: string][] = [];
  return {
    read: (key: string, where: string) => void read.push([key, where]),
    choice: (options: { id?: Id; text: string; once?: boolean }[], room: Id | undefined) =>
      recordChoice(known, options, room),
    check(err: (where: string, msg: string) => void) {
      for (const [key, where] of read) {
        const problem = seenKeyProblem(known, key);
        if (problem) err(where, problem);
      }
    },
  };
}

/**
 * The old place of each topic, `once` listener and `once` room choice option that has an id → the key the engine
 * records for it: what `npm run ids -- --write` rewrites in the sources (#359), the same pairs the validator names.
 */
export function movedSeenKeys(game: GameDef): Map<string, string> {
  const known = seenKeys(game);
  for (const { list, room } of cmdLists(game))
    eachCmd(list, (c) => {
      if (typeof c !== 'string' && 'choice' in c) recordChoice(known, c.choice, room?.id);
    });
  return known.moved;
}
