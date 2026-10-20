// The validator's checks of the player's side (out of tools/validate.ts, 4.2.4): the texts of the save and settings
// menus, and how the player's taps read (#188): `input.exitOnTap` a boolean, an exit's `onTap` `go` or `walk`.
import type { GameDef } from '../../core/types';

const SAVE_TEXTS = ['save', 'load', 'slot', 'emptySlot', 'exportSave', 'importSave', 'confirmOverwrite'] as const;
const SETTINGS_TEXTS = [
  'settings',
  'textSpeed',
  'textSize',
  'reduceMotion',
  'volumeMusic',
  'volumeSfx',
  'slow',
  'normal',
  'fast',
  'large',
] as const;
const ON_TAP = new Set(['go', 'walk']);

export function playerChecks(
  game: GameDef,
  o: { err: (where: string, msg: string) => void; warn: (where: string, msg: string) => void },
): void {
  const { err, warn } = o;
  if (game.saves && (!Number.isInteger(game.saves.slots) || game.saves.slots < 0))
    err('saves', 'slots must be a whole number');
  if (game.saves?.slots)
    for (const k of SAVE_TEXTS)
      if (!game.ui[k]) warn(`ui.${k}`, 'missing text for the save menu (English default used)');
  if (game.settings)
    for (const k of SETTINGS_TEXTS)
      if (!game.ui[k]) warn(`ui.${k}`, 'missing text for the settings menu (English default used)');
  const input: unknown = game.input;
  const tap = input && typeof input === 'object' ? (input as Record<string, unknown>).exitOnTap : undefined;
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
    err('input', 'input is an object: { exitOnTap?: boolean }');
  else if (tap !== undefined && typeof tap !== 'boolean') err('input.exitOnTap', 'exitOnTap is true or false');
  for (const r of game.rooms)
    for (const [xid, ex] of Object.entries(r.exits ?? {}))
      if (ex.onTap !== undefined && !ON_TAP.has(ex.onTap))
        err(`${r.id}.exits.${xid}`, `onTap is "go" or "walk", not "${String(ex.onTap)}"`);
}
