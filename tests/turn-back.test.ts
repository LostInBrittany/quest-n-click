// A character with `turnBack` turns back to its side once the hero is done with it (4.6.1, #417): after a whole
// conversation (until "Bye") and after any other action, to the state's facing; never written to the state.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore, type Presenter } from '@engine/core/ports';
import type { GameDef, Layout } from '@engine/core/types';

function game(turnBack: boolean): GameDef {
  return {
    id: 'turnback',
    title: 'Turn back',
    saveVersion: 1,
    hero: 'hero',
    verbs: [
      { id: 'look', label: 'Look', color: '#fff' },
      { id: 'talk', label: 'Talk', color: '#fff' },
      { id: 'give', label: 'Give', color: '#fff', join: 'to' },
    ],
    characters: {
      hero: { name: 'Hero', color: '#fff', sprites: { idle: ['h/1'] } },
      grump: { name: 'Grump', color: '#0f0', sprites: { idle: ['g/1'] } },
    },
    items: { tile: { name: 'tile', icon: 'i/tile' } },
    rooms: [
      {
        id: 'square',
        name: 'Square',
        decor: 'd/square',
        actors: { grump: { char: 'grump', facing: 'left', ...(turnBack ? { turnBack: true } : {}) } },
        look: { grump: ['He counts his tiles.'] },
        talk: {
          grump: [
            { topic: 'Nice game?', do: [{ say: ['grump', 'Hush.'] }] },
            { topic: 'Look at me.', do: [{ face: 'hero', who: 'grump' }, { say: ['grump', 'There.'] }] },
          ],
        },
        on: [{ verb: 'give', a: 'tile', b: 'grump', do: [{ say: ['grump', 'Not mine.'] }] }],
      },
    ],
    rules: { fallbacks: { look: ['Nothing.'] } },
    start: { room: 'square', inventory: ['tile'] },
    skin: {} as GameDef['skin'],
    ui: {} as GameDef['ui'],
  };
}

const layouts: Record<string, Layout> = {
  square: { entries: { default: [560, 360] }, actors: { grump: { x: 200, y: 340, h: 110 } } },
};

async function boot(turnBack = true) {
  const ui = new FakePresenter();
  // Turns and lines in one log, to see their order.
  (ui as Presenter).face = (who, dir) => {
    ui.log.push(`face ${who} ${dir}`);
  };
  const e = new Engine(game(turnBack), layouts, ui, new MemoryStore());
  e.random = () => 0;
  await e.newGame();
  ui.log = [];
  return { e, ui };
}

const turns = (log: string[]) => log.filter((l) => l.startsWith('face grump'));

describe('turnBack (#417)', () => {
  it('after a whole conversation, the character turns back at "Bye", not before', async () => {
    const { e, ui } = await boot();
    ui.picks = [0]; // a topic, then "Bye" (the default answer)
    await e.act({ verb: 'talk', a: 'grump' });
    expect(turns(ui.log)).toEqual(['face grump right', 'face grump left']);
    const back = ui.log.lastIndexOf('face grump left');
    expect(back).toBeGreaterThan(ui.log.lastIndexOf('grump: Hush.'));
    expect(back).toBeGreaterThan(ui.log.findLastIndex((l) => l.startsWith('choose')));
    expect(e.state.actors['square.grump']?.facing).toBeUndefined();
  });

  it('after another action (a look line, a rule), it turns back too', async () => {
    const { e, ui } = await boot();
    await e.act({ verb: 'look', a: 'grump' });
    expect(turns(ui.log)).toEqual(['face grump right', 'face grump left']);
    ui.log = [];
    await e.act({ verb: 'give', a: 'tile', b: 'grump' });
    expect(turns(ui.log)).toEqual(['face grump right', 'face grump left']);
    expect(ui.log.lastIndexOf('face grump left')).toBeGreaterThan(ui.log.indexOf('grump: Not mine.'));
  });

  it('a `face` command during the action wins: the character stays on the side it left in the state', async () => {
    const { e, ui } = await boot();
    ui.picks = [1];
    await e.act({ verb: 'talk', a: 'grump' });
    expect(e.state.actors['square.grump']?.facing).toBe('right');
    expect(turns(ui.log).at(-1)).toBe('face grump right');
  });

  it('without turnBack, nothing turns it back', async () => {
    const { e, ui } = await boot(false);
    await e.act({ verb: 'look', a: 'grump' });
    expect(turns(ui.log)).toEqual(['face grump right']);
  });
});
