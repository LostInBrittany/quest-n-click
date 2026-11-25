// @vitest-environment happy-dom
// A mouse over the map, pause or music button, or a character's switch button, names the button in the sentence line, in place of "Walk to"; leaving it
// gives the sentence back.
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const build = (players?: string[]) =>
  new App({
    root: document.body,
    game: { ...mini(), ui: demo.ui, skin: demo.skin, ...(players ? { players: { ids: players } } : {}) },
    layouts: miniLayouts,
    manifest: { images: {} },
  });

const pointer = (type: string, pointerType: string) => new PointerEvent(type, { pointerType });
const tool = (label: string) => {
  const b = document.querySelector<HTMLButtonElement>(`.tools .tool[aria-label="${label}"]`);
  if (!b) throw new Error(`no tool ${label}`);
  return b;
};

describe('the tool buttons name themselves under a mouse', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([demo.ui.mapTitle, demo.ui.pause, demo.ui.music])(
    '%s replaces the walk verb, then gives it back',
    async (label) => {
      const app = build();
      await app.engine.newGame();
      app.sentence();
      expect(app.sbar.textContent).toBe(demo.ui.walkTo);
      tool(label).dispatchEvent(pointer('pointerenter', 'mouse'));
      expect(app.sbar.textContent).toBe(label);
      tool(label).dispatchEvent(pointer('pointerleave', 'mouse'));
      expect(app.sbar.textContent).toBe(demo.ui.walkTo);
      app.destroy();
    },
  );

  it("a character's switch button names the character", async () => {
    const app = build(['hero', 'bea']);
    await app.engine.newGame();
    app.sentence();
    tool('Bea').dispatchEvent(pointer('pointerenter', 'mouse'));
    expect(app.sbar.textContent).toBe('Bea');
    tool('Bea').dispatchEvent(pointer('pointerleave', 'mouse'));
    expect(app.sbar.textContent).toBe(demo.ui.walkTo);
    app.destroy();
  });

  it('a finger does not change the sentence', async () => {
    const app = build();
    await app.engine.newGame();
    app.sentence();
    tool(demo.ui.pause).dispatchEvent(pointer('pointerenter', 'touch'));
    expect(app.sbar.textContent).toBe(demo.ui.walkTo);
    app.destroy();
  });
});
