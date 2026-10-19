// The asset tools on the processing worker (4.2.2 PR 6b, D43, docs/dev/QUALIF-4.2.2-ASSETS.md): `prepare` of the game
// in `dir` (a version 2 snapshot: its sources, data, art and sounds), run in the worker's child as `npm run assets`
// runs it: the references the content cites (`tools/refs.ts`), then `tools/assets.py`, with the Python packages the
// worker's build hook installed (`.python/`, PYTHONPATH) and the worker's PATH (python3, ffmpeg), nothing else. What comes back: the
// prepared files (`assets/img|audio|video/…`, base64 by path) and the game's new `assets.gen.json`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameModule } from '../../../tools/game';

const ENGINE = fileURLToPath(new URL('../../../', import.meta.url));

export interface Prepared {
  /** The prepared files by their path under the public folder (`assets/img/…`), base64. */
  files: Record<string, string>;
  /** The game's `assets.gen.json` after the run. */
  manifest: string;
}

/** The paths a `prepare` gives back: under `assets/img`, `assets/audio`, `assets/video`, plain names. */
const PREPARED_PATH = /^assets\/(img|audio|video)\/[\w.-]+(?:\/[\w.-]+){0,4}$/;

/** A `prepare`'s answer as the child wrote it, or undefined: its files bounded (5,000), plain paths, base64. */
export function preparedShape(v: unknown): Prepared | undefined {
  const o = (v ?? {}) as { files?: unknown; manifest?: unknown };
  if (typeof o.manifest !== 'string' || o.manifest.length > 2 * 1024 * 1024) return undefined;
  if (!o.files || typeof o.files !== 'object' || Array.isArray(o.files)) return undefined;
  const entries = Object.entries(o.files as Record<string, unknown>);
  if (entries.length > 5_000) return undefined;
  for (const [k, b] of entries)
    if (!PREPARED_PATH.test(k) || k.split('/').some((s) => /^\.+$/.test(s)) || typeof b !== 'string') return undefined;
  return { files: o.files as Record<string, string>, manifest: o.manifest };
}

export async function prepareIn(dir: string, game: string, mod: GameModule, path?: string): Promise<Prepared> {
  const { collectRefs } = await import('../../../tools/refs');
  const { loadLayouts } = await import('../../../src/engine/tools/load');
  // Inside the job's folder, removed with it; the asset tools read the game through GAME_DIR.
  const work = resolve(dir, '.prepare');
  mkdirSync(join(work, '.cache'), { recursive: true });
  writeFileSync(
    join(work, '.cache', 'refs.json'),
    JSON.stringify(collectRefs({ ...mod, layouts: loadLayouts(join(dir, 'layout')) })),
  );
  const r = spawnSync('python3', [join(ENGINE, 'tools', 'assets.py')], {
    cwd: work,
    env: {
      PATH: path ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: work,
      // The asset tools work in a project's folder (their refs, their output), the game read through GAME_DIR.
      WEB_SCUMM_PROJECT: work,
      GAME: game,
      GAME_DIR: dir,
      PYTHONPATH: join(ENGINE, '.python'),
    },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(
      `prepare failed (exit ${r.status}): ${String(r.stderr || r.stdout)
        .trim()
        .split('\n')
        .slice(-3)
        .join(' ')}`,
    );
  const out = join(work, 'public');
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else files[relative(out, p).split(sep).join('/')] = readFileSync(p).toString('base64');
    }
  };
  walk(join(out, 'assets'));
  return { files, manifest: readFileSync(join(dir, 'assets.gen.json'), 'utf8') };
}
