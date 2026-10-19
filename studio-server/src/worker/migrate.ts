// The engine's upgrade of a hosted game on the processing worker (4.2.3 PR 8, H6): `web-scumm migrate` on the game in
// `dir` (a snapshot), run in the worker's child, its result given back rather than written. The authoring schema is
// `schemaVersion` (docs/en/UPGRADING.md): 3 is this engine's; a game on 2 (a 4.1.x import that never migrated) gets its
// stable ids written as `npm run ids -- --write --map` writes them (tools/ids/plan.ts), then the three lines UPGRADING
// leaves to the author in `game.ts` (`schemaVersion: 3`, `saveVersion` + 1, the ids' migration step). Nothing is
// decided here: the Studio judges the migrated game (validate, then solve) before it writes anything (engine-upgrade.ts).
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { GameDef } from '../../../src/engine/core/types';
import { addSchema3ToGameSource } from '../../../tools/ids/codemod';
import { planIds } from '../../../tools/ids/plan';
import { packable } from './snapshot';

const CURRENT_SCHEMA = 3;

export interface Migrated {
  schema: { from: number; to: number };
  /** The files the migration changes, by their path in the game (`/`), their whole new text. */
  files: Record<string, string>;
  /** What the tool could not write (a list built by code, a computed `saveVersion`): the validator will say why. */
  skipped: string[];
}

/** The paths a migration gives back: a game's sources and data, plain names, nothing hidden. */
const MIGRATED_PATH = /^(?:[\w-][\w.-]*\/){0,4}[\w-][\w.-]*\.(?:ts|json)$/;
const MAX_FILES = 1_000;
const MAX_BYTES = 8 * 1024 * 1024;

/** A `migrate`'s answer as the child wrote it, or why it is refused: bounded, plain paths, texts. */
export function migratedShape(v: unknown): Migrated | { refused: string } {
  const o = (v ?? {}) as { schema?: { from?: unknown; to?: unknown }; files?: unknown; skipped?: unknown };
  const from = o.schema?.from,
    to = o.schema?.to;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { refused: 'no schema' };
  if (!o.files || typeof o.files !== 'object' || Array.isArray(o.files)) return { refused: 'no files' };
  const entries = Object.entries(o.files as Record<string, unknown>);
  if (entries.length > MAX_FILES) return { refused: `more than ${MAX_FILES} files` };
  let bytes = 0;
  for (const [k, t] of entries) {
    if (!MIGRATED_PATH.test(k) || !packable(k) || typeof t !== 'string')
      return { refused: `a file the migration may not write: ${k.slice(0, 120)}` };
    bytes += t.length;
    if (bytes > MAX_BYTES) return { refused: `more than ${MAX_BYTES >> 20} MiB` };
  }
  return {
    schema: { from: from as number, to: to as number },
    files: o.files as Record<string, string>,
    skipped: Array.isArray(o.skipped) ? o.skipped.slice(0, 50).map((s) => String(s).slice(0, 300)) : [],
  };
}

/** The migration of the game in `dir` to this engine's schema: what it would write, nothing written. */
export function migrateIn(dir: string, game: GameDef): Migrated {
  const from = game.schemaVersion ?? 2;
  if (from === CURRENT_SCHEMA) return { schema: { from, to: from }, files: {}, skipped: [] };
  if (from > CURRENT_SCHEMA)
    throw new Error(`authoring schema ${from} is newer than this engine's (${CURRENT_SCHEMA}): upgrade the Studio`);
  const plan = planIds(dir, game, { write: true, map: true });
  const next = new Map<string, string>();
  const skipped: string[] = [];
  for (const { file, r } of plan.results) {
    if (r.inserted.length) next.set(file, r.code);
    for (const s of r.skipped)
      skipped.push(
        `${relative(dir, file)}:${s.line} ${s.path}: ${s.reason}${s.expected ? ` (expected: ${s.expected})` : ''}`,
      );
  }
  for (const u of plan.unknownRooms) skipped.push(`${relative(dir, u.file)}: no room of the game has id "${u.id}"`);
  for (const f of [...plan.locales, ...plan.maps]) next.set(f.file, f.text);
  const gameFile = join(dir, 'game.ts');
  const g = addSchema3ToGameSource(next.get(gameFile) ?? readFileSync(gameFile, 'utf8'), game.saveVersion);
  next.set(gameFile, g.code);
  for (const s of g.skipped)
    skipped.push(`game.ts:${s.line} ${s.path}: ${s.reason}${s.expected ? ` (expected: ${s.expected})` : ''}`);
  const files: Record<string, string> = {};
  for (const [file, text] of next) {
    let was: string | undefined;
    try {
      was = readFileSync(file, 'utf8');
    } catch {
      was = undefined;
    }
    if (was !== text) files[relative(dir, file).split(sep).join('/')] = text;
  }
  return { schema: { from, to: CURRENT_SCHEMA }, files, skipped };
}
