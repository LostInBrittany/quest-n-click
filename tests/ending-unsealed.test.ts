// A sealed ending that could not be opened (a wrong typed password, the sealed file not reachable offline) does not
// end the game (#475): the presenter says `false`, nothing is saved as finished, the card is not asked for.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { speedrunGame, speedrunLayouts } from './fixtures/speedrun-game';

const sealed = (opened: boolean | undefined) => {
  const p = new FakePresenter();
  const phases: string[] = [];
  p.ending = async (phase) => {
    phases.push(phase);
    return phase === 'open' ? opened : undefined;
  };
  return { p, phases };
};

describe('the sealed ending', () => {
  it('not opened: the game goes on, nothing is saved as finished, no card', async () => {
    const { p, phases } = sealed(false);
    const e = new Engine(speedrunGame(), speedrunLayouts, p, new MemoryStore());
    await e.newGame();
    await e.script([{ ending: true, after: ['Yay.'] }]);
    expect(e.state.done).toBeFalsy();
    expect(phases).toEqual(['open']);
    expect(p.log).not.toContain('Yay.');
  });

  it('opened (or a presenter that says nothing, as before): the game ends and the card is shown', async () => {
    for (const opened of [true, undefined]) {
      const { p, phases } = sealed(opened);
      const e = new Engine(speedrunGame(), speedrunLayouts, p, new MemoryStore());
      await e.newGame();
      await e.script([{ ending: true }]);
      expect(e.state.done).toBe(true);
      expect(phases).toEqual(['open', 'card']);
    }
  });
});
