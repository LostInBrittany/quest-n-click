// A sheet's cutting and a cell's keying on the processing worker (4.2.3 PR 7, H8): run in the worker's child, on a
// snapshot that carries the uploaded image (`upload/source.<ext>`), the sheet's cells as they are (`art/<sheet>/`) and
// the game's `site.json` (its art style), with the same Python tools as the dev server (tools/studio/cut.ts), the
// packages the worker's build hook installed and the worker's PATH; no game code runs. What comes back: the cells
// written, base64 by path under the game (`art/<sheet>/r1c1.png`), and what the tool said.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CutRequest, cutOnCopy } from '../../../tools/studio/cut';

const ENGINE = fileURLToPath(new URL('../../../', import.meta.url));

export interface Cut {
  /** The cells written, base64 by their path in the game (`art/<sheet>/…`). */
  files: Record<string, string>;
  output: string;
  keyed?: 'keyed' | 'kept' | 'opaque';
}

const SHEET_ID = /^[A-Za-z0-9][\w-]{0,63}$/;
const CELL_ID = /^[\w-]{1,64}(\/[\w-]{1,64}){0,3}$/;

/** A cut's request as a job carries it, or null: the same rules as the routes that make it. */
export function cutRequest(v: unknown): CutRequest | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.sheetId !== 'string' || !SHEET_ID.test(o.sheetId) || o.sheetId === 'decor') return null;
  if (o.mode === 'sheet') {
    const { cols, rows, only } = o;
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
    if ((cols as number) < 1 || (cols as number) > 99 || (rows as number) < 1 || (rows as number) > 99) return null;
    if (
      only !== undefined &&
      (!Array.isArray(only) || !only.every((c) => typeof c === 'string' && /^r\d{1,2}c\d{1,2}$/.test(c)))
    )
      return null;
    return {
      mode: 'sheet',
      sheetId: o.sheetId,
      cols: cols as number,
      rows: rows as number,
      only: only as string[] | undefined,
    };
  }
  if (o.mode === 'cell') {
    if (typeof o.cell !== 'string' || !CELL_ID.test(o.cell)) return null;
    if (o.key !== 'auto' && o.key !== 'always' && o.key !== 'never') return null;
    return { mode: 'cell', sheetId: o.sheetId, cell: o.cell, key: o.key };
  }
  return null;
}

/**
 * A cut's answer as the child wrote it, or why it is refused: only cells of the sheet asked (a grid's `r<row>c<col>.png`,
 * or the one cell keyed), at most a grid's 99 × 99, base64.
 */
export function cutShape(v: unknown, req: CutRequest): Cut | { refused: string } {
  const o = (v ?? {}) as { files?: unknown; output?: unknown; keyed?: unknown };
  if (!o.files || typeof o.files !== 'object' || Array.isArray(o.files)) return { refused: 'no files' };
  const entries = Object.entries(o.files as Record<string, unknown>);
  if (entries.length > 99 * 99) return { refused: 'more cells than a grid has' };
  const prefix = `art/${req.sheetId}/`;
  for (const [k, b] of entries) {
    const name = k.startsWith(prefix) ? k.slice(prefix.length) : '';
    const ok = req.mode === 'sheet' ? /^r\d{1,2}c\d{1,2}\.png$/.test(name) : name === `${req.cell}.png`;
    if (!ok || typeof b !== 'string') return { refused: `a file the cut was not asked for: ${k.slice(0, 120)}` };
  }
  if (req.mode === 'cell' && o.keyed !== 'keyed' && o.keyed !== 'kept' && o.keyed !== 'opaque')
    return { refused: 'no keying said' };
  return {
    files: o.files as Record<string, string>,
    output: typeof o.output === 'string' ? o.output.slice(0, 4_000) : '',
    ...(req.mode === 'cell' ? { keyed: o.keyed as Cut['keyed'] } : {}),
  };
}

/** Runs the cut asked on the snapshot unpacked in `dir`. */
export async function cutIn(
  dir: string,
  game: string,
  req: CutRequest,
  path?: string,
  pythonPath = join(ENGINE, '.python'),
): Promise<Cut> {
  const up = join(dir, 'upload');
  const source = existsSync(up) ? readdirSync(up).find((f) => /^source\.(png|jpe?g|webp)$/.test(f)) : undefined;
  if (!source) throw new Error('the snapshot carries no uploaded image');
  // Inside the job's folder, removed with it.
  const work = resolve(dir, '.cut');
  mkdirSync(work, { recursive: true });
  const out = await cutOnCopy({
    tmp: work,
    artDir: join(dir, 'art'),
    source: join(up, source),
    req,
    engine: ENGINE,
    env: {
      PATH: path ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: work,
      GAME: game,
      GAME_DIR: dir,
      PYTHONPATH: pythonPath,
    },
  });
  return {
    files: Object.fromEntries(out.files.map((f) => [`art/${f.path}`, f.bytes.toString('base64')])),
    output: out.output.split('\n').slice(-12).join('\n'),
    ...(out.keyed ? { keyed: out.keyed } : {}),
  };
}
