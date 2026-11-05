// The validator's check of images by language (4.7.0, #430, core/lang-images.ts): every source and variant id of
// `i18n.images` exists; a variant for the game's own language or for a language the game does not ship is never drawn.
import type { GameDef } from '../../core/types';

export function langImageChecks(
  game: GameDef,
  o: {
    img: (id: string | undefined, where: string) => void;
    err: (where: string, msg: string) => void;
    warn: (where: string, msg: string) => void;
    locales?: Readonly<Record<string, Record<string, string>>>;
  },
): void {
  const own = game.lang ?? 'en';
  for (const [id, by] of Object.entries(game.i18n?.images ?? {})) {
    o.img(id, `i18n.images.${id}`);
    for (const [lang, v] of Object.entries(by ?? {})) {
      const w = `i18n.images.${id}.${lang}`;
      if (typeof v !== 'string' || !v) o.err(w, 'an image id');
      else o.img(v, w);
      if (lang === own) o.warn(w, `"${lang}" is the game's own language: its variant is never drawn`);
      else if (o.locales && !o.locales[lang])
        o.warn(w, `no translation in "${lang}" (locales/${lang}.json): its variant is never drawn`);
    }
  }
}
