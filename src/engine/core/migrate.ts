// Save migrations, as data (`GameDef.migrations`): one step per version, renames and drops, applied in a chain until the
// save reaches the game's `saveVersion`. Pure: returns the migrated copy, or null when a step is missing (the engine
// then starts a new game, as it always did for a save of another version).
import type { GameDef, GameState, Migration } from './types';
import { roomKey, splitRoomKey } from './keys';

function renameKeys<T>(o: Record<string, T>, map: Record<string, string> | undefined): Record<string, T> {
  if (!map) return o;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(o)) out[map[k] ?? k] = v;
  return out;
}
const renameList = (l: string[] | undefined, map: Record<string, string> | undefined, drop?: string[]) =>
  l?.filter((x) => !drop?.includes(x)).map((x) => map?.[x] ?? x);

/** Applies one migration step to a state (in place), returns it. */
export function applyMigration(s: GameState, m: Migration): GameState {
  s.flags = renameKeys(s.flags, m.renameFlag);
  for (const f of m.dropFlag ?? []) delete s.flags[f];
  s.inventory = renameList(s.inventory, m.renameItem, m.dropItem) ?? [];
  if (s.used) s.used = renameList(s.used, m.renameItem, m.dropItem);
  // The other playable characters keep their own inventory, room and positions.
  for (const p of Object.values(s.players ?? {})) {
    p.inventory = renameList(p.inventory, m.renameItem, m.dropItem) ?? [];
    if (p.used) p.used = renameList(p.used, m.renameItem, m.dropItem);
    if (m.renameRoom) {
      p.room = m.renameRoom[p.room] ?? p.room;
      p.hero = renameKeys(p.hero, m.renameRoom);
    }
  }
  if (m.renameRoom) {
    s.room = m.renameRoom[s.room] ?? s.room;
    s.hero = renameKeys(s.hero, m.renameRoom);
    s.visited = renameKeys(s.visited, m.renameRoom);
    const prefix = (o: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => {
          const parts = splitRoomKey(k);
          return parts ? [roomKey(m.renameRoom![parts[0]] ?? parts[0], parts[1]), v] : [k, v];
        }),
      );
    s.props = prefix(s.props) as GameState['props'];
    s.actors = prefix(s.actors) as GameState['actors'];
    if (s.where) s.where = Object.fromEntries(Object.entries(s.where).map(([c, r]) => [c, m.renameRoom![r] ?? r]));
  }
  s.props = renameKeys(s.props, m.renameProp);
  s.actors = renameKeys(s.actors, m.renameActor);
  s.unlocked = renameList(s.unlocked, m.renamePlace) ?? [];
  s.counters = renameKeys(s.counters, m.renameCounter);
  for (const k of m.dropCounter ?? []) delete s.counters[k];
  s.seen = renameKeys(s.seen, m.renameSeen);
  for (const k of m.dropSeen ?? []) delete s.seen[k];
  if (s.scripts) {
    const scripts = renameKeys(s.scripts, m.renameScript);
    for (const k of m.dropScript ?? []) delete scripts[k];
    for (const [id, st] of Object.entries(scripts))
      if (st.step) st.step = m.renameScriptStep?.[id]?.[st.step] ?? st.step;
    s.scripts = scripts;
  }
  if (m.renameCharacter && s.where) s.where = renameKeys(s.where, m.renameCharacter);
  if (m.renamePlayer) {
    s.active = s.active ? (m.renamePlayer[s.active] ?? s.active) : s.active;
    if (s.players) s.players = renameKeys(s.players, m.renamePlayer);
  }
  s.v = m.from + 1;
  return s;
}

/** The save brought to the game's version, or null when it cannot be (no chain of migrations from its version). */
export function migrate(game: GameDef, save: GameState | null): GameState | null {
  if (!save) return null;
  if (save.v === game.saveVersion) return save;
  const s = structuredClone(save);
  for (let guard = 0; s.v !== game.saveVersion && guard < 1000; guard++) {
    const m = game.migrations?.find((x) => x.from === s.v);
    if (!m) return null;
    applyMigration(s, m);
  }
  return s.v === game.saveVersion ? s : null;
}

/**
 * A save past an `{ end: true, keepPlaying: true }` (4.7.0, #437) loads with its end cleared: the end was reached, and
 * the world goes on from it (rooms, scripts and sequences run again). Any other save is returned as it is.
 */
export function afterEnd(s: GameState | null): GameState | null {
  if (s?.keepPlaying) delete s.done;
  return s;
}
