// What `npm run ids` writes, computed without writing (4.2.3: shared by tools/ids.ts and the worker's `migrate`): the
// ids `assignIds` gives the loaded game, inserted into the sources of `gameDir` (rooms/*.ts, rules.ts, items.ts,
// game.ts), the positional `seen` keys of those sources renamed (#359), the translation tables' keys renamed, and
// (`map`) the save migration and the paths' map. Reads only.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assignIds, renamePaths } from '../../src/engine/core/content-ids';
import type { GameDef } from '../../src/engine/core/types';
import { movedSeenKeys } from '../../src/engine/tools/validate/seen';
import {
  addIdsToGameSource,
  addIdsToItemsSource,
  addIdsToRoomSource,
  addIdsToRulesSource,
  type CodemodResult,
  roomIdOf,
} from './codemod';
import { renameSeenKeysInSource, type SeenRename } from './seen-keys';

export interface IdsPlan {
  /**
   * Each source file the codemod read, and what it would do there; `r.code` has its `seen` keys renamed too, listed
   * in `seen`: a `{ seen: key }` or a checkpoint's key naming the old place of something that has an id (#359).
   */
  results: { file: string; r: CodemodResult; seen: SeenRename[] }[];
  /** A room file whose `id` names no room of the game (left as it is). */
  unknownRooms: { file: string; id: string | undefined }[];
  /** The translation tables, keys renamed (`write`), and how many paths moved in each. */
  locales: { file: string; text: string; moved: number }[];
  /** `map`: ids.migration.json and ids.paths.json as they would be written. */
  maps: { file: string; text: string }[];
  map: ReturnType<typeof assignIds>['map'];
  added: number;
}

export function planIds(
  gameDir: string,
  game: GameDef,
  o: { lines?: boolean | 'all'; write?: boolean; map?: boolean } = {},
): IdsPlan {
  const { game: assigned, map, added } = assignIds(game, { lines: o.lines ?? false });
  // The save migration's renames, and the old place of what already had an id (an earlier run): the validator's pairs.
  // Renamed before the ids are inserted, so that the lines listed are the lines of the file as it is.
  const rename = new Map([...movedSeenKeys(assigned), ...Object.entries(map.seen)]);
  const seen = new Map<string, SeenRename[]>();
  const read = (file: string) => {
    const s = renameSeenKeysInSource(readFileSync(file, 'utf8'), rename, file);
    seen.set(file, s.renamed);
    return s.code;
  };
  const results: IdsPlan['results'] = [];
  const add = (file: string, r: CodemodResult) => results.push({ file, r, seen: seen.get(file) ?? [] });
  const unknownRooms: IdsPlan['unknownRooms'] = [];
  const roomsDir = join(gameDir, 'rooms');
  for (const f of existsSync(roomsDir)
    ? readdirSync(roomsDir)
        .filter((x) => x.endsWith('.ts'))
        .sort()
    : []) {
    const file = join(roomsDir, f);
    const code = read(file);
    const id = roomIdOf(code, f);
    const room = assigned.rooms.find((r) => r.id === id);
    if (!room) {
      unknownRooms.push({ file, id });
      continue;
    }
    add(file, addIdsToRoomSource(code, room, f));
  }
  const rulesFile = join(gameDir, 'rules.ts');
  if (existsSync(rulesFile)) add(rulesFile, addIdsToRulesSource(read(rulesFile), assigned.rules, 'rules.ts'));
  const itemsFile = join(gameDir, 'items.ts');
  if (existsSync(itemsFile)) add(itemsFile, addIdsToItemsSource(read(itemsFile), assigned.items, 'items.ts'));
  const gameFile = join(gameDir, 'game.ts');
  if (existsSync(gameFile)) add(gameFile, addIdsToGameSource(read(gameFile), assigned, 'game.ts'));

  const locales: IdsPlan['locales'] = [];
  const dir = join(gameDir, 'locales');
  if (o.write && existsSync(dir))
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const file = join(dir, f);
      const table = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
      const { _: header, ...rest } = table;
      const renamed = renamePaths(rest, map.paths);
      const moved = Object.keys(rest).filter((k) => !(k in renamed)).length;
      locales.push({ file, text: JSON.stringify({ _: header, ...renamed }, null, 1) + '\n', moved });
    }

  const maps: IdsPlan['maps'] = [];
  if (o.map) {
    // A second pass (line ids on a schema-3 game) adds to the files of the first: nothing already recorded is lost.
    const readJson = (f: string) => {
      try {
        return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    };
    const prev = readJson(join(gameDir, 'ids.migration.json'));
    const moved = Object.keys(map.seen).length + Object.keys(map.counters).length;
    const migration =
      moved || !prev
        ? {
            from: (prev?.from as number | undefined) ?? game.saveVersion,
            renameSeen: { ...((prev?.renameSeen as Record<string, string>) ?? {}), ...map.seen },
            renameCounter: { ...((prev?.renameCounter as Record<string, string>) ?? {}), ...map.counters },
          }
        : prev;
    maps.push({ file: join(gameDir, 'ids.migration.json'), text: JSON.stringify(migration, null, 2) + '\n' });
    const prevPaths = (readJson(join(gameDir, 'ids.paths.json')) as Record<string, string> | undefined) ?? {};
    maps.push({
      file: join(gameDir, 'ids.paths.json'),
      text: JSON.stringify({ ...prevPaths, ...map.paths }, null, 2) + '\n',
    });
  }
  return { results, unknownRooms, locales, maps, map, added };
}
