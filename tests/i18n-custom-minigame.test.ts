// A game's own minigame declares its player-visible params in `textParams` (#250): `npm run i18n -- extract` writes
// them to the locale files and `status` counts them, as it does for the built-in minigames. The game folder is built
// in .cache with an index.ts exporting the game and its `minigames`, and the CLI runs on it through $GAME_DIR.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { localeStatus } from '@engine/tools/i18n';
import type { GameDef } from '@engine/core/types';
import { mini } from './fixtures/mini';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'i18n-minigame-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const PATH = 'room:a/on[0].do[0].params.intro';

/** The micro-game with a rule that opens the game's own `duel` minigame. */
function duelGame(): GameDef {
  const g = mini();
  g.rooms[0].on = [
    { verb: 'use', a: 'badge', b: 'valise', do: [{ minigame: 'duel', params: { intro: 'En garde!', taps: 3 } }] },
  ];
  return g;
}
const duel = { duel: { run: async () => 'won' as const, textParams: ['intro'] } };

/** A game folder whose index.ts exports duelGame() and the `duel` minigame, as a game's own module does. */
function gameFolder(name: string) {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'index.ts'),
    `import { mini } from ${JSON.stringify(join(ROOT, 'tests', 'fixtures', 'mini.ts').replace(/\\/g, '/'))};
const g = mini();
g.rooms[0].on = [{ verb: 'use', a: 'badge', b: 'valise', do: [{ minigame: 'duel', params: { intro: 'En garde!', taps: 3 } }] }];
export const game = g;
export const layouts = {};
export const manifest = {};
export const minigames = { duel: { run: async () => 'won', textParams: ['intro'] } };
`,
  );
  return dir;
}

function i18n(dir: string, args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, GAME_DIR: dir };
  for (const k of ['GAME', 'WEB_SCUMM_PROJECT']) delete env[k];
  return spawnSync(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      '--tsconfig',
      join(ROOT, 'tsconfig.json'),
      join(ROOT, 'tools', 'i18n.ts'),
      ...args,
    ],
    {
      cwd: ROOT,
      env: env as NodeJS.ProcessEnv,
      encoding: 'utf8',
    },
  );
}

describe("a custom minigame's textParams (#250)", () => {
  it('localeStatus counts them when it is given the minigames', () => {
    const st = localeStatus(duelGame(), {}, 140, duel);
    expect(st.missing).toContain(PATH);
    expect(localeStatus(duelGame(), { [PATH]: 'En garde !' }, 140, duel).stale).toEqual([]);
  });

  it('npm run i18n -- extract writes them, and status does not call them stale', () => {
    const dir = gameFolder('extract');
    const ex = i18n(dir, ['extract', '--lang', 'fr']);
    expect(ex.status, ex.stderr + ex.stdout).toBe(0);
    const fr = JSON.parse(readFileSync(join(dir, 'locales', 'fr.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(dir, 'locales', 'en.json'), 'utf8'));
    expect(en[PATH]).toBe('En garde!');
    expect(fr[PATH]).toBe('En garde!');
    const st = i18n(dir, ['status']);
    expect(st.stdout).not.toMatch(/stale/);
    expect(st.stdout).toMatch(/missing|same as en/); // nothing translated yet, but every path is known
  }, 60_000);
});
