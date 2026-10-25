// @vitest-environment happy-dom
// A flag can switch a character's variant (a costume, a prop): the room redraws when a flag changes, at once, not
// after the conversation or the cutscene that set it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const build = () =>
  new App({
    root: document.body,
    game: { ...mini(), ui: demo.ui, skin: demo.skin },
    layouts: miniLayouts,
    manifest: { images: {} },
  });

describe('a flag change redraws the room', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('once per change while a room is shown, mid-command list', async () => {
    const app = build();
    await app.engine.newGame();
    const redraw = vi.spyOn(app.view, 'redraw');
    await app.engine.exec([{ set: 'costume' }], { room: app.engine.room(), fast: false });
    expect(redraw).toHaveBeenCalledTimes(1);
    await app.engine.exec([{ set: ['costume', false] }, { set: 'prop' }], { room: app.engine.room(), fast: false });
    expect(redraw).toHaveBeenCalledTimes(3);
    app.destroy();
  });

  it('never without a room on screen', async () => {
    const app = build();
    const redraw = vi.spyOn(app.view, 'redraw');
    app.engine.journal.emit({ kind: 'flagChanged', flag: 'costume', value: true } as never);
    expect(redraw).not.toHaveBeenCalled();
    app.destroy();
  });
});
