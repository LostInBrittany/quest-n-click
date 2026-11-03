// A choice shown full screen (4.6.0, `{ choice, screen }`, types/content.ts `ChoiceScreen`): the hero choice screen.
// Its own backdrop over the whole scene, the side column hidden (as the title screen does), the title on top, and each
// option with an `img` standing on the backdrop, side by side at one height, its text under it; the options without
// an `img` are buttons under them. One tap picks, through the same `pick` intention as the side column's choices, so
// the engine records the same answer. Presentation only: nothing here reads or writes the state.
import type { ChoiceScreen, Id } from '../core/types';
import { roving, trapFocus } from './a11y';
import { el, esc } from './app-shared';
import type { App } from './app';

let seq = 0;

export async function chooseScreen(
  app: App,
  options: { text: string; img?: Id }[],
  screen: ChoiceScreen,
): Promise<number> {
  app.closeTranscript();
  app.choosing = true;
  app.side.style.display = 'none';
  app.layoutTitle(true);
  const ov = el('div', 'overlay choicescreen');
  if (app.settings.reduceMotion) ov.classList.add('still');
  // Sizes follow the scene, as the title screen's do: the heroes stand about half its height.
  ov.style.fontSize = `${Math.max(9, Math.round(app.sw * 0.018))}px`;
  ov.style.setProperty('--h', `${Math.round(app.scene.getBoundingClientRect().height * 0.48)}px`);
  ov.style.setProperty('--n', String(Math.max(1, options.filter((o) => o.img).length)));
  app.scene.append(ov);
  // The images first, so the heroes appear at once on their backdrop (as the title screen waits for its decor).
  await app.bank.preload([screen.decor, ...options.flatMap((o) => (o.img ? [o.img] : []))]);
  const back = el('img', 'back') as HTMLImageElement;
  back.src = app.bank.img(screen.decor);
  ov.append(back);
  const group = el('div', 'group');
  group.setAttribute('role', 'group');
  if (screen.title) {
    const id = `choicescreen-title-${++seq}`;
    const t = el('div', 'title', esc(screen.title));
    t.id = id;
    group.append(t);
    group.setAttribute('aria-labelledby', id);
  } else group.setAttribute('aria-label', app.game.title);
  const heroes = el('div', 'heroes');
  const lines = el('div', 'lines');
  options.forEach((o, i) => {
    const b = o.img
      ? el('button', 'choice hero', `<img src="${app.bank.img(o.img)}" alt=""><span>${esc(o.text)}</span>`)
      : el('button', 'choice', esc(o.text));
    if (o.img) b.style.setProperty('--i', String(i));
    b.onclick = () => void app.presenter.intent({ kind: 'pick', choice: i });
    (o.img ? heroes : lines).append(b);
  });
  if (heroes.childElementCount) group.append(heroes);
  if (lines.childElementCount) group.append(lines);
  ov.append(group);
  const unrove = roving(group, '.choice');
  const release = trapFocus(group, { initial: group.querySelector<HTMLElement>('.choice'), restore: false });
  return new Promise((res) => {
    app.presenter.picking = (i) => {
      if (!options[i]) return;
      app.presenter.picking = null;
      unrove();
      release();
      ov.remove();
      app.side.style.display = '';
      app.layoutTitle(false);
      app.choosing = false;
      app.verbsEl.hidden = false;
      app.invEl.hidden = false;
      app.renderInv();
      res(i);
    };
  });
}
