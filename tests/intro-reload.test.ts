// A reload during the New Game intro (#401): the autosave is written only once the intro has finished, so Continue
// never resumes a game whose intro was cut short (the hero choice of games/heroes left unanswered, `form` unset).
// A game without an intro still writes its autosave at the start, as before.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef } from '@engine/core/types';
import { game, layouts } from '../games/heroes';
import { game as demo, layouts as demoLayouts } from '../games/demo';

/** A presenter whose choice stays open until the test answers it: the moment a player could reload the page. */
class OpenChoice extends FakePresenter {
  opened!: Promise<void>;
  private onOpen!: () => void;
  answer!: (i: number) => void;
  /** What the store held when the first room was shown. */
  atEnter: unknown = 'not entered';
  constructor(private store: MemoryStore) {
    super();
    this.opened = new Promise((r) => (this.onOpen = r));
  }
  override async enterRoom(room: Parameters<FakePresenter['enterRoom']>[0]) {
    if (this.atEnter === 'not entered') this.atEnter = this.store.load();
    return super.enterRoom(room);
  }
  override async choose(options: { text: string }[], who?: string) {
    if (who !== undefined || this.asked.length) return super.choose(options, who);
    this.asked.push({ n: options.length, topic: false, texts: options.map((o) => o.text) });
    this.onOpen();
    return new Promise<number>((r) => (this.answer = r));
  }
}

describe('a reload during the New Game intro (games/heroes)', () => {
  it('no autosave while the hero choice is open: Continue cannot skip it', async () => {
    const store = new MemoryStore();
    const ui = new OpenChoice(store);
    const e = new Engine(structuredClone(game), layouts, ui, store);
    const started = e.newGame();
    await ui.opened;
    expect(ui.atEnter).toBeNull();
    // The page reloads here: a new engine on the same store, as the title screen asks it.
    expect(store.load()).toBeNull();
    expect(new Engine(structuredClone(game), layouts, new FakePresenter(), store).hasSave()).toBe(false);
    // The tab that stayed open goes on: the pick is saved once the intro ends.
    ui.answer(2);
    await started;
    expect(store.load()?.flags.form).toBe('gull');
    const again = new Engine(structuredClone(game), layouts, new FakePresenter(), store);
    await again.continueGame();
    expect(again.state.flags.form).toBe('gull');
  });

  it('an intro without a choice: no autosave until its last line is said', async () => {
    const g: GameDef = structuredClone(game);
    g.start.intro = [{ id: 'game.intro.l-who', say: ['hero', 'Who am I this morning?'] }];
    const store = new MemoryStore();
    const seen: unknown[] = [];
    const ui = new (class extends FakePresenter {
      override async say(who: string, text: string, o?: { voice?: string }) {
        seen.push(store.load());
        return super.say(who, text, o);
      }
    })();
    await new Engine(g, layouts, ui, store).newGame();
    expect(seen[0]).toBeNull();
    expect(store.load()?.room).toBe('garden');
  });

  it('an intro that ends in a tutorial (games/demo): saved once the player has the hand, the guess kept', async () => {
    const store = new MemoryStore();
    const ui = new FakePresenter();
    ui.picks = [0];
    const e = new Engine(structuredClone(demo), demoLayouts, ui, store);
    const started = e.newGame();
    await expect.poll(() => e.guiding).toEqual({ verb: 'look', target: 'pantry' });
    // The tutorial waits for the player, who plays: the autosave was written at the hand-off and is written again.
    expect(store.load()?.flags.guess).toBe('sardines');
    e.state.flags.seen_pantry_hint = true;
    e.save();
    expect(store.load()?.flags.seen_pantry_hint).toBe(true);
    for (const [verb, a] of [
      ['look', 'pantry'],
      ['talk', 'grandma'],
      ['take', 'shell'],
    ] as const) {
      await expect.poll(() => e.guiding).toEqual({ verb, target: a });
      await e.act({ verb, a });
    }
    await started;
    expect(store.load()?.inventory).toContain('shell_phone');
  });

  it('a game without an intro writes its autosave at the start, as before', async () => {
    const g: GameDef = structuredClone(game);
    delete g.start.intro;
    const store = new MemoryStore();
    const ui = new OpenChoice(store);
    await new Engine(g, layouts, ui, store).newGame();
    expect((ui.atEnter as { room?: string } | null)?.room).toBe('garden');
    expect(store.load()?.room).toBe('garden');
  });
});
