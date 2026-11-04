// A choice shown full screen (4.6.0, `{ choice, screen }`, the hero choice screen). Presentation only: the schema
// accepts it, the engine hands it to the presenter with its title filled (switches, `{hero}`, the translation) and
// does not say the pick back, the asset graph and `npm run assets` take its backdrop, the validator checks it, the
// translation tables carry its title, the IR (logic) leaves it out and the presentation hash carries it, and the solver
// still branches over the intro's choice.
import { describe, expect, it } from 'vitest';
import { assetGraph } from '@engine/core/asset-graph';
import { compileGame } from '@engine/core/define';
import { Engine } from '@engine/core/engine';
import { fingerprint, presentationOf } from '@engine/core/fingerprint';
import { compileIR } from '@engine/core/ir';
import { cmdSchema } from '@engine/core/ir-schema';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Choice, ChoiceScreen, Cmd, GameDef, Layout } from '@engine/core/types';
import { applyLocale, textPaths } from '@engine/tools/i18n';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { collectRefs } from '../tools/refs';

const layouts: Record<string, Layout> = {
  room: { entries: { default: [320, 360] }, hotspots: { exit: { rect: [10, 10, 40, 40] } } },
};
const heroes: Choice[] = [
  { id: 'c-knight', text: 'Knight', img: 'heroes/knight', do: [{ set: ['form', 'knight'] }] },
  { id: 'c-witch', text: 'Witch', img: 'heroes/witch', do: [{ set: ['form', 'witch'] }] },
  { id: 'c-robot', text: 'Robot', img: 'heroes/robot', do: [{ set: ['form', 'robot'] }] },
];
const SCREEN: ChoiceScreen = { decor: 'heroes/stage', title: 'Who am I{form?knight=, sir|*=}?' };
const game = (screen: ChoiceScreen | null = SCREEN, choice: Choice[] = heroes): GameDef => ({
  id: 'choice-screen',
  title: 'Choice screen',
  saveVersion: 1,
  hero: 'hero',
  verbs: [{ id: 'use', label: 'Use', color: '#fff' }],
  characters: { hero: { name: 'Hero', color: '#fff', sprites: { idle: ['hero'] } } },
  items: {},
  rooms: [
    {
      id: 'room',
      name: 'Room',
      decor: 'room',
      hotspots: { exit: { name: 'exit' } },
      look: { exit: 'The exit.' },
      on: [
        // Only the first hero (never the silent presenter's default, the last option) sets `knighted`.
        { verb: 'use', a: 'exit', if: { flag: 'form', eq: 'knight' }, do: [{ set: 'knighted' }, { end: true }] },
        { verb: 'use', a: 'exit', do: [{ end: true }] },
      ],
    },
  ],
  rules: { fallbacks: { use: ['No.'] } },
  start: { room: 'room', intro: [screen ? { choice, screen } : { choice }] },
  skin: { icons: { map: 'map', pause: 'pause', music: 'music' } },
  ui: {} as GameDef['ui'],
});
const images = Object.fromEntries(
  ['hero', 'room', 'map', 'pause', 'music', 'heroes/stage', 'heroes/knight', 'heroes/witch', 'heroes/robot'].map(
    (k) => [k, [10, 10] as [number, number]],
  ),
);

/** A presenter that records what `choose` was handed. */
function recording(picks: number[] = []) {
  const ui = new FakePresenter();
  ui.picks = picks;
  const seen: { options: unknown; screen: unknown }[] = [];
  const choose = ui.choose.bind(ui);
  ui.choose = async (options, who, screen) => {
    seen.push({ options, screen });
    return choose(options, who);
  };
  return { ui, seen };
}

describe('a choice shown full screen (ChoiceScreen)', () => {
  it('the schema accepts a screen beside the options', () => {
    expect(cmdSchema.safeParse({ choice: heroes, screen: SCREEN }).success).toBe(true);
  });

  it('the engine hands the screen to the presenter, its title filled, and does not say the pick back', async () => {
    const { ui, seen } = recording();
    const e = new Engine(game(), layouts, ui, new MemoryStore());
    await e.newGame();
    // The title is filled when asked (the flag is not set yet: the `*=` text).
    expect(seen[0]).toEqual({
      options: heroes.map((o) => ({ text: o.text, img: o.img })),
      screen: { decor: 'heroes/stage', title: 'Who am I?' },
    });
    expect(e.state.flags.form).toBe('robot');
    expect(ui.log.filter((l) => l.startsWith('hero: '))).toEqual([]);
    // Without `screen`, nothing changes: no screen handed, the pick said back by the hero.
    const plain = recording();
    const p = new Engine(game(null), layouts, plain.ui, new MemoryStore());
    await p.newGame();
    expect(plain.seen[0]!.screen).toBeUndefined();
    expect(plain.ui.log.includes('hero: Robot')).toBe(true);
  });

  it('a translation translates the title (start/intro[0].screen.title)', async () => {
    expect(textPaths(game())).toContainEqual({ path: 'start/intro[0].screen.title', text: SCREEN.title });
    const fr = applyLocale(game(), { 'start/intro[0].screen.title': 'Qui suis-je{form?knight=, messire|*=} ?' });
    const { ui, seen } = recording();
    await new Engine(fr, layouts, ui, new MemoryStore()).newGame();
    expect(seen[0]!.screen).toEqual({ decor: 'heroes/stage', title: 'Qui suis-je ?' });
  });

  it('the asset graph preloads the backdrop with the intro; npm run assets prepares it', () => {
    expect(assetGraph(game()).title).toEqual(expect.arrayContaining(['img:heroes/stage', 'img:heroes/knight']));
    expect(collectRefs({ game: game() }).images).toEqual(expect.arrayContaining(['heroes/stage', 'heroes/robot']));
  });

  it('the validator checks the backdrop and the title, and warns of an option without a picture', () => {
    expect(validate(game(), layouts, { assets: { images } }).errors).toEqual([]);
    const missing = validate(game({ decor: 'heroes/nowhere' }), layouts, { assets: { images } });
    expect(missing.errors).toContainEqual(
      expect.stringMatching(/start\.intro\[0\]\.screen\.decor › image not found: "heroes\/nowhere"/),
    );
    const bad = validate(game({ title: '' } as unknown as ChoiceScreen), layouts, { assets: { images } });
    expect(bad.errors).toContainEqual(expect.stringMatching(/screen › a choice screen needs a "decor"/));
    expect(bad.errors).toContainEqual(expect.stringMatching(/screen\.title › empty text/));
    const text = validate(game(SCREEN, [...heroes, { id: 'c-none', text: 'Nobody', do: [] }]), layouts, {
      assets: { images },
    });
    expect(text.errors).toEqual([]);
    expect(text.warnings).toContainEqual(expect.stringMatching(/choice\[3\] › no "img" in a choice screen/));
  });

  it('is presentation: the logic fingerprint ignores it, the presentation one moves', async () => {
    const print = (g: GameDef) => {
      const c = compileGame(g);
      return fingerprint(compileIR(c, { extensions: { trusted: '' }, engine: 'x' }), {
        presentation: presentationOf(c),
        engine: 'x',
      });
    };
    const [a, b, c] = await Promise.all([
      print(game(null)),
      print(game()),
      print(game({ ...SCREEN, decor: 'heroes/stage_v2' })),
    ]);
    expect(b.logic).toBe(a.logic);
    expect(c.logic).toBe(a.logic);
    expect(b.presentation).not.toBe(a.presentation);
    expect(c.presentation).not.toBe(b.presentation);
    expect(JSON.stringify(compileIR(compileGame(game()), { extensions: { trusted: '' } }))).not.toContain('stage');
    // A game without a screen keeps the presentation it had (no new key).
    expect(presentationOf(compileGame(game(null)))).not.toHaveProperty('game.choiceScreens');
  });

  it('the solver still branches over the screen’s options', async () => {
    const r = await solve(game(), layouts, { mode: 'prove' });
    expect(r.finished).toBe(true);
    expect(r.flagsReached).toContain('knighted');
  });

  it('a screen choice anywhere else (a room’s arrival) is the same command', async () => {
    const g = game(null);
    g.start.intro = [];
    g.rooms[0]!.onEnter = [{ choice: heroes, screen: { decor: 'heroes/stage' } } as Cmd];
    const { ui, seen } = recording([1]);
    const e = new Engine(g, layouts, ui, new MemoryStore());
    await e.newGame();
    expect(seen[0]!.screen).toEqual({ decor: 'heroes/stage' });
    expect(e.state.flags.form).toBe('witch');
  });
});
