// The validator's checks of the dev checkpoints (`?dev&at=<checkpoint>`): their goals, room, inventory, places,
// props, moving characters, `seen` keys (#248) and playable characters.
import type { Cond, GameDef, Id, RoomDef } from '../../core/types';

export function checkpointChecks(
  game: GameDef,
  o: {
    err: (where: string, msg: string) => void;
    cond: (c: Cond | undefined, where: string, room?: RoomDef) => void;
    rooms: Map<Id, RoomDef>;
    places: Record<Id, unknown>;
    playerIds: Id[];
    propRef: (id: Id, state: string | undefined, where: string) => void;
    mover: (char: Id, roomId: Id, where: string) => void;
    seen: (key: string, where: string) => void;
  },
): void {
  const { err, cond, rooms, places, playerIds, propRef, mover } = o;
  const items = game.items;
  for (const [cid, c] of Object.entries(game.checkpoints ?? {})) {
    const w = `checkpoints.${cid}`;
    (c.goals ?? []).forEach((g, i) => cond(g, `${w}.goals[${i}]`, rooms.get(c.room)));
    if (!rooms.has(c.room)) err(w, `unknown room: "${c.room}"`);
    for (const i of c.inventory ?? []) if (!items[i]) err(w, `unknown item: "${i}"`);
    for (const p of c.unlocked ?? []) if (!places[p]) err(w, `unknown map place: "${p}"`);
    for (const k of Object.keys(c.seen ?? {})) o.seen(k, `${w}.seen`);
    for (const [k, st] of Object.entries(c.props ?? {})) propRef(k, st, w);
    for (const [ch, rid] of Object.entries(c.where ?? {})) mover(ch, rid, `${w}.where`);
    if (c.active && !playerIds.includes(c.active)) err(w, `"${c.active}" is not a playable character`);
    for (const [pid, p] of Object.entries(c.players ?? {})) {
      if (!playerIds.includes(pid)) err(`${w}.players`, `"${pid}" is not a playable character`);
      if (!rooms.has(p.room)) err(`${w}.players.${pid}`, `unknown room: "${p.room}"`);
      for (const i of p.inventory ?? []) if (!items[i]) err(`${w}.players.${pid}`, `unknown item: "${i}"`);
    }
  }
}
