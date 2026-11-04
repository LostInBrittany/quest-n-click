// A choice shown full screen (4.6.0, `{ choice, screen }`, ChoiceScreen): its backdrop must be an image, its title a
// text; an option without an `img` is allowed but shows as a plain button under the pictures, so it is a warning.
import type { Choice, ChoiceScreen, Id } from '../../core/types';

interface Sink {
  err: (where: string, msg: string) => void;
  warn: (where: string, msg: string) => void;
  img: (id: Id | undefined, where: string) => void;
  text: (t: string | undefined, where: string) => void;
}

export function choiceScreenChecks(screen: ChoiceScreen | undefined, choice: Choice[], where: string, s: Sink) {
  if (screen === undefined) return;
  const w = `${where}.screen`;
  if (!screen || typeof screen !== 'object' || typeof screen.decor !== 'string' || !screen.decor)
    s.err(w, 'a choice screen needs a "decor" (the backdrop image)');
  else s.img(screen.decor, `${w}.decor`);
  if (screen?.title !== undefined && typeof screen.title !== 'string') s.err(`${w}.title`, 'the title is a text');
  else s.text(screen?.title, `${w}.title`);
  choice.forEach((o, j) => {
    if (!o.img) s.warn(`${where}.choice[${j}]`, 'no "img" in a choice screen: it shows as a button under the pictures');
  });
}
