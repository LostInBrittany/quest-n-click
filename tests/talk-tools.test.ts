// The mouth-kit tools find the game's folder as the other tools do (#307): tools/talk-kit.py and tools/talk-apply.py
// read and write games/<id>/ in the engine repository's layout, game/ in a created project (run by hand from its folder,
// or through `quest-n-click talk-kit` / `talk-apply`, which set WEB_SCUMM_PROJECT), and $GAME_DIR when it is set.
// Each case builds its own folder from a validated sprite of the sample game. Pasting the mouths back needs OpenCV,
// which requirements.txt leaves out: that case runs where cv2 is installed, the path checks run everywhere.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const tmp = mkdtempSync(join(ROOT, '.cache', 'talk-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const SPRITE = join(ROOT, 'games', 'demo', 'art', 'grandma', 'r3c1.png');
const hasCv2 = spawnSync('python3', ['-c', 'import cv2']).status === 0;

/** The environment without any game selection of the machine running the tests. */
function env(extra: Record<string, string> = {}) {
  const e: Record<string, string | undefined> = { ...process.env, ...extra };
  for (const k of ['GAME', 'GAME_DIR', 'WEB_SCUMM_PROJECT']) if (!(k in extra)) delete e[k];
  return e as NodeJS.ProcessEnv;
}

/** A game folder holding one character (`grandma`, pose `face`) and its talk-kits.json. */
function gameFolder(dir: string) {
  mkdirSync(join(dir, 'art', 'grandma'), { recursive: true });
  copyFileSync(SPRITE, join(dir, 'art', 'grandma', 'r3c1.png'));
  writeFileSync(join(dir, 'talk-kits.json'), JSON.stringify({ grandma: { face: 'grandma/r3c1' } }));
}

/** The engine repository's layout: package.json naming the game, games/<id>/. */
function repoLayout(name: string) {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ config: { game: 'g' } }));
  gameFolder(join(root, 'games', 'g'));
  return { root, game: join(root, 'games', 'g') };
}

/** A created project's layout: game/ with its index.ts, the engine elsewhere. */
function projectLayout(name: string) {
  const root = join(tmp, name);
  gameFolder(join(root, 'game'));
  writeFileSync(join(root, 'game', 'index.ts'), 'export {};\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, config: { game: name } }));
  return { root, game: join(root, 'game') };
}

const run = (cwd: string, file: string, args: string[], extra?: Record<string, string>) =>
  spawnSync(file, args, { cwd, env: env(extra), encoding: 'utf8' });
const tool = (cwd: string, name: string, args: string[] = [], extra?: Record<string, string>) =>
  run(cwd, 'python3', [join(ROOT, 'tools', `${name}.py`), ...args], extra);
const cli = (cwd: string, args: string[]) =>
  run(cwd, process.execPath, [join(ROOT, 'cli', 'quest-n-click.mjs'), ...args]);

/** The kit talk-kit wrote, copied as the generator's reply (the mouths unchanged). */
function reply(game: string) {
  const kits = join(game, 'private', 'talk_kits');
  copyFileSync(join(kits, 'grandma_face.png'), join(kits, 'grandma_face_out.png'));
}

/** Pixels of a PNG, to compare t1 with the validated sprite. */
const pixels = (file: string) =>
  execFileSync(
    'python3',
    [
      '-c',
      'import sys,hashlib,numpy as np;from PIL import Image;print(hashlib.sha1(np.asarray(Image.open(sys.argv[1]).convert("RGBA")).tobytes()).hexdigest())',
      file,
    ],
    { encoding: 'utf8' },
  ).trim();

function expectKit(game: string) {
  const kits = join(game, 'private', 'talk_kits');
  expect(existsSync(join(kits, 'grandma_face.png'))).toBe(true);
  expect(JSON.parse(readFileSync(join(kits, 'grandma_face.json'), 'utf8')).sprite).toBe('grandma/r3c1');
}

describe('tools/talk-kit.py and tools/talk-apply.py find the game folder (#307)', () => {
  it('the engine repository: games/<config.game>/', () => {
    const { root, game } = repoLayout('repo');
    const r = tool(root, 'talk-kit');
    expect(r.status, r.stderr).toBe(0);
    expectKit(game);
    expect(r.stdout).toContain(join('games', 'g', 'private', 'talk_kits', 'grandma_face.png'));
  });

  it('a created project run by hand from its folder: game/', () => {
    const { root, game } = projectLayout('byhand');
    const r = tool(root, 'talk-kit', ['grandma']);
    expect(r.status, r.stderr).toBe(0);
    expectKit(game);
    expect(existsSync(join(root, 'games'))).toBe(false);
  });

  it('a created project through the quest-n-click command (WEB_SCUMM_PROJECT): game/', () => {
    const { root, game } = projectLayout('viacli');
    const r = cli(root, ['talk-kit']);
    expect(r.status, r.stderr).toBe(0);
    expectKit(game);
    expect(cli(root, ['help']).stdout).toMatch(/talk-kit[\s\S]*talk-apply[\s\S]*talk-normalize/);
  });

  it('$GAME_DIR wins over the layout', () => {
    const { root } = repoLayout('gamedir');
    const other = join(tmp, 'elsewhere');
    gameFolder(other);
    const r = tool(root, 'talk-kit', [], { GAME_DIR: other });
    expect(r.status, r.stderr).toBe(0);
    expectKit(other);
    expect(existsSync(join(root, 'games', 'g', 'private'))).toBe(false);
  });

  it('says which file is missing, in the game folder it found', () => {
    const { root } = projectLayout('missing');
    rmSync(join(root, 'game', 'talk-kits.json'));
    const k = tool(root, 'talk-kit');
    expect(k.status).toBe(1);
    expect(k.stderr).toContain(join('game', 'talk-kits.json'));
    const a = tool(root, 'talk-apply', ['grandma_face']);
    expect(a.status).toBe(1);
    expect(a.stderr).toContain(join('game', 'private', 'talk_kits', 'grandma_face.json'));
    gameFolder(join(root, 'game'));
    expect(tool(root, 'talk-kit').status).toBe(0);
    const noReply = tool(root, 'talk-apply', ['grandma_face']);
    expect(noReply.status).toBe(1);
    expect(noReply.stderr).toContain(join('game', 'private', 'talk_kits', 'grandma_face_out.png'));
  });

  it.skipIf(!hasCv2)(
    'talk-apply writes art/talk_<char>/<pose>/t1..t6, t1 the validated sprite, in both layouts',
    () => {
      for (const { root, game } of [repoLayout('apply-repo'), projectLayout('apply-project')]) {
        expect(tool(root, 'talk-kit').status).toBe(0);
        reply(game);
        const r = tool(root, 'talk-apply', ['grandma_face']);
        expect(r.status, r.stderr).toBe(0);
        const out = join(game, 'art', 'talk_grandma', 'face');
        for (let k = 1; k <= 6; k++) expect(existsSync(join(out, `t${k}.png`))).toBe(true);
        expect(pixels(join(out, 't1.png'))).toBe(pixels(SPRITE));
      }
    },
  );
});
