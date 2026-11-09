// A loop restarted while its old run is still inside a step (a room re-entry or a character switch during a `wait`):
// one loop goes on, no step is skipped and no third loop starts (#484).
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { world, worldLayouts } from './fixtures/world';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** The script's own `wait: 1000` ends only when the test says so; the loop's idle waits pass at once. */
class HeldPresenter extends FakePresenter {
  held: (() => void)[] = [];
  override async wait(...[ms]: [number?, boolean?]): Promise<void> {
    if (ms === 1000) return new Promise<void>((r) => this.held.push(r));
    await tick(1);
  }
}

describe('a loop restarted during a step', () => {
  it('runs on as one loop: the step after the wait still runs', async () => {
    const ui = new HeldPresenter();
    const e = new Engine(world(), worldLayouts, ui, new MemoryStore());
    e.autoScripts = true;
    await e.newGame();
    await tick();
    expect(ui.held.length).toBe(1); // hall_clock is inside its `wait: 1000`
    e.startScripts(false); // the room entered again
    await tick();
    for (const end of ui.held.splice(0)) {
      end();
      await tick();
    }
    expect(e.state.flags.ticks).toBe(1);
    expect(e.scheduler.has('hall_clock')).toBe(true);
    e.destroy();
  });

  it('the old run ending does not forget the new one', async () => {
    const ui = new HeldPresenter();
    const e = new Engine(world(), worldLayouts, ui, new MemoryStore());
    e.autoScripts = true;
    await e.newGame();
    await tick();
    e.startScripts(false);
    await tick();
    ui.held.shift()!(); // the first run's wait ends
    await tick();
    expect(e.scheduler.has('hall_clock')).toBe(true);
    expect(ui.held.length).toBe(1); // one loop waits, a startScript would not launch another
    e.destroy();
  });
});
