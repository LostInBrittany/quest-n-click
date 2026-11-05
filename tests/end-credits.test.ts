// `{ end: true, credits, title, keepPlaying }` (4.7.0, #437): the end asks the player for the credits and the title
// screen, and with `keepPlaying` a load goes back into a world that runs (rooms, scripts, every line of a sequence).
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Cmd, GameDef } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from './fixtures/mini';

function game(end: Cmd): GameDef {
  const g = mini();
  g.credits = ['MINI', '', 'Thanks for playing!'];
  g.rooms[0].on!.push({ verb: 'look', a: 'valise', do: [end, 'Never said.'] });
  g.rooms[1].onEnter = ['Arrived.', 'Still here.', 'All the way.'];
  return g;
}

async function ended(end: Cmd) {
  const store = new MemoryStore();
  const ui = new FakePresenter();
  const e = new Engine(game(end), miniLayouts, ui, store);
  await e.newGame();
  ui.log = [];
  await e.act({ verb: 'look', a: 'valise' });
  return { e, ui, store };
}

/** Continue after the end: a new engine on the same save, as the title screen's Continue does. */
async function continued(store: MemoryStore, end: Cmd) {
  const ui = new FakePresenter();
  const e = new Engine(game(end), miniLayouts, ui, store);
  await e.continueGame();
  return { e, ui };
}

describe('the end with credits, title and keepPlaying', () => {
  it('asks the player for the credits, then the title, and runs nothing after the end', async () => {
    const { e, ui } = await ended({ end: true, credits: true, title: true });
    expect(ui.log.slice(-3)).toEqual(['END', 'CREDITS', 'TITLE']);
    expect(ui.log.join('\n')).not.toContain('Never said.');
    expect(e.state.done).toBe(true);
  });

  it('a plain end asks for neither', async () => {
    const { ui } = await ended({ end: true });
    expect(ui.log).toContain('END');
    expect(ui.log).not.toContain('CREDITS');
    expect(ui.log).not.toContain('TITLE');
  });

  it('keepPlaying: the end is reached, and Continue goes back into a world that runs', async () => {
    const end: Cmd = { end: true, credits: true, title: true, keepPlaying: true };
    const { e, store } = await ended(end);
    expect(e.state.done).toBe(true); // the solver's goal and the replays still see the end
    expect(store.load()?.keepPlaying).toBe(true);
    const back = await continued(store, end);
    expect(back.e.state.done).toBeUndefined();
    back.ui.log = [];
    await back.e.script(['One.', 'Two.', 'Three.']);
    expect(back.ui.log.filter((l) => /One|Two|Three/.test(l))).toHaveLength(3);
    back.ui.log = [];
    await back.e.script([{ goto: 'b' }]);
    expect(back.ui.log.join('\n')).toContain('All the way.');
  });

  it('without keepPlaying, a loaded end stays ended (as before)', async () => {
    const end: Cmd = { end: true };
    const { store } = await ended(end);
    const back = await continued(store, end);
    expect(back.e.state.done).toBe(true);
    back.ui.log = [];
    await back.e.script(['One.', 'Two.']);
    expect(back.ui.log.join('\n')).not.toContain('Two.');
  });

  it('a later end without keepPlaying ends the game for good', async () => {
    const store = new MemoryStore();
    const g = game({ end: true, keepPlaying: true });
    g.rooms[1].on = [{ verb: 'look', a: 'cadenas', do: [{ end: true }] }];
    const e = new Engine(g, miniLayouts, new FakePresenter(), store);
    await e.newGame();
    await e.act({ verb: 'look', a: 'valise' });
    const e2 = new Engine(g, miniLayouts, new FakePresenter(), store);
    await e2.continueGame();
    await e2.script([{ goto: 'b' }]);
    await e2.act({ verb: 'look', a: 'cadenas' });
    expect(store.load()?.keepPlaying).toBeUndefined();
    const e3 = new Engine(g, miniLayouts, new FakePresenter(), store);
    await e3.continueGame();
    expect(e3.state.done).toBe(true);
  });

  it('the validator refuses credits the game does not have', () => {
    const g = game({ end: true, credits: true });
    delete g.credits;
    const { errors } = validate(g, miniLayouts);
    expect(errors.some((x) => /end with "credits"/.test(x))).toBe(true);
    expect(validate(game({ end: true, credits: true }), miniLayouts).errors.some((x) => /end with/.test(x))).toBe(
      false,
    );
  });
});
