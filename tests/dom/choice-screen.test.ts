// @vitest-environment happy-dom
// The hero choice screen (4.6.0, `{ choice, screen }`, dom/choice-screen.ts): full screen over its backdrop, the side
// column hidden; a group named by the title; the options with `img` standing as buttons named by their text, then the
// others as plain buttons; the first one focused, the arrow keys walk them, Tab stays inside; the pick is the option's
// own index, through the same `pick` intention; once picked, the screen goes and the side column is back.
import { afterEach, describe, expect, it } from 'vitest';
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
const key = (k: string) =>
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('the hero choice screen (ChoiceScreen)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('full screen, named by its title, heroes first; a tap picks the option and gives the room back', async () => {
    const app = build();
    await app.engine.newGame();
    const pick = app.presenter.choose(
      [{ text: 'Nobody' }, { text: 'Sam', img: 'sam/full' }, { text: 'Samia & co', img: 'sam_f/full' }],
      undefined,
      { decor: 'stage/back', title: 'Who am I?' },
    );
    await settle();
    const ov = document.querySelector<HTMLElement>('.overlay.choicescreen')!;
    expect(ov).not.toBeNull();
    expect(app.side.style.display).toBe('none');
    expect(document.querySelector('.side .choices')).toBeNull();
    expect(ov.querySelector('img.back')!.getAttribute('src')).toBe(app.bank.img('stage/back'));
    const group = ov.querySelector('[role="group"]')!;
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)!.textContent).toBe('Who am I?');
    const heroes = [...ov.querySelectorAll<HTMLButtonElement>('.heroes > .choice.hero')];
    expect(heroes.map((b) => b.textContent)).toEqual(['Sam', 'Samia & co']);
    expect(heroes[0]!.querySelector('img')!.getAttribute('alt')).toBe('');
    expect(heroes[1]!.querySelector('img')!.getAttribute('src')).toBe(app.bank.img('sam_f/full'));
    // DOM order (the keyboard's and the screen reader's): the heroes, then the plain option.
    expect([...ov.querySelectorAll('.choice')].map((b) => b.textContent)).toEqual(['Sam', 'Samia & co', 'Nobody']);
    expect(document.activeElement).toBe(heroes[0]);
    key('ArrowRight');
    expect(document.activeElement).toBe(heroes[1]);
    key('ArrowRight');
    expect(document.activeElement!.textContent).toBe('Nobody');
    key('Home');
    expect(document.activeElement).toBe(heroes[0]);
    heroes[1]!.click();
    await expect(pick).resolves.toBe(2);
    expect(document.querySelector('.choicescreen')).toBeNull();
    expect(app.side.style.display).toBe('');
    expect(app.choosing).toBe(false);
    app.destroy();
  });

  it('without a title the group is named by the game; reduced motion stills the heroes', async () => {
    const app = build();
    app.settings.reduceMotion = true;
    await app.engine.newGame();
    const pick = app.presenter.choose([{ text: 'Yes', img: 'y' }], undefined, { decor: 'stage/back' });
    await settle();
    const ov = document.querySelector<HTMLElement>('.choicescreen')!;
    expect(ov.classList.contains('still')).toBe(true);
    expect(ov.querySelector('.title')).toBeNull();
    expect(ov.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe(app.game.title);
    await app.presenter.intent({ kind: 'pick', choice: 0 });
    await expect(pick).resolves.toBe(0);
    app.destroy();
  });
});
