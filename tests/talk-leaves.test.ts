// A topic whose `do` changes room or ends the game closes the conversation: the old room's menu never reopens (#494).
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Cmd } from '@engine/core/types';
import { mini, miniLayouts } from './fixtures/mini';

async function talkThen(leave: Cmd) {
  const g = mini();
  g.rooms[0]!.talk = {
    uncle: [
      { topic: 'Leave?', do: [leave] },
      { topic: 'The weather?', do: ['Grey.'] },
    ],
  };
  const ui = new FakePresenter();
  ui.picks = [0, 1]; // the leaving topic, then the weather if the menu came back
  const e = new Engine(g, miniLayouts, ui, new MemoryStore());
  await e.newGame();
  await e.script([{ talk: 'uncle' }]);
  return { e, ui };
}

describe('a topic that leaves the conversation', () => {
  it('a goto in a topic closes the menu of the room left', async () => {
    const { e, ui } = await talkThen({ goto: 'b' });
    expect(e.state.room).toBe('b');
    expect(ui.asked).toHaveLength(1);
    expect(ui.log).not.toContain('hero: The weather?');
  });

  it('an end in a topic closes the menu', async () => {
    const { e, ui } = await talkThen({ end: true });
    expect(e.state.done).toBe(true);
    expect(ui.asked).toHaveLength(1);
  });
});
