// @vitest-environment happy-dom
// On a computer the tools stand in a column beside the bag: more than three visible ones go into two columns, so the
// buttons keep their size whatever the number of playable characters (#561). The active character's button is hidden
// and does not count.
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

const tools = () => document.querySelector<HTMLElement>('.tools');

describe('the tools go into two columns past three', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('three tools: one column', async () => {
    const app = build();
    await app.engine.newGame();
    expect(tools()?.classList.contains('two')).toBe(false);
    app.destroy();
  });

  it('two players: the active one hidden, four tools left, two columns', async () => {
    const app = build(['hero', 'bea']);
    await app.engine.newGame();
    expect(tools()?.querySelectorAll('.tool:not([hidden])').length).toBe(4);
    expect(tools()?.classList.contains('two')).toBe(true);
    app.destroy();
  });

  it('one player in the list (the hero alone, hidden): three tools, one column', async () => {
    const app = build(['hero']);
    await app.engine.newGame();
    expect(tools()?.classList.contains('two')).toBe(false);
    app.destroy();
  });
});
