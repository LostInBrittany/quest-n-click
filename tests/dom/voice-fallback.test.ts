// @vitest-environment happy-dom
// A voiced line whose clip cannot play (before the first gesture, sound off, voice volume 0, a file that fails) stays
// on screen for its reading time, as if it had no clip (#249). A clip that plays still sets the line's length.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { sayMs } from '@engine/core/timing';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const TEXT = 'A line with a clip that will not play.';

function build() {
  const g = { ...mini(), ui: demo.ui, skin: demo.skin, audio: { voices: { 'v.one': 'one.mp3' } } };
  return new App({ root: document.body, game: g, layouts: miniLayouts, manifest: { images: {} } });
}

describe('a voiced line whose clip cannot play', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('keeps its bubble for the reading time (no gesture yet: the clip cannot play)', async () => {
    const app = build();
    await app.engine.newGame();
    let done = false;
    void app.presenter.say('voice', TEXT, { voice: 'v.one' }).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(app.speechEl).not.toBeNull();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(sayMs(TEXT, app.settings.textSpeed));
    expect(app.speechEl).toBeNull();
    expect(done).toBe(true);
    app.destroy();
  });

  it('a clip that fails after a while leaves the rest of the reading time, not a whole one more', async () => {
    const app = build();
    await app.engine.newGame();
    let fail!: (played: boolean) => void;
    app.audio.voice = () => new Promise<boolean>((r) => (fail = r));
    void app.presenter.say('voice', TEXT, { voice: 'v.one' });
    const ms = sayMs(TEXT, app.settings.textSpeed);
    await vi.advanceTimersByTimeAsync(ms - 500);
    fail(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(app.speechEl).not.toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(app.speechEl).toBeNull();
    app.destroy();
  });

  it('a clip that plays ends the line when it ends', async () => {
    const app = build();
    await app.engine.newGame();
    let end!: (played: boolean) => void;
    app.audio.voice = () => new Promise<boolean>((r) => (end = r));
    void app.presenter.say('voice', TEXT, { voice: 'v.one' });
    await vi.advanceTimersByTimeAsync(sayMs(TEXT, app.settings.textSpeed) * 2);
    expect(app.speechEl).not.toBeNull();
    end(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(app.speechEl).toBeNull();
    app.destroy();
  });
});
