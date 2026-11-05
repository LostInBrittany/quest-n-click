// Images by language: `GameDef.i18n.images` names, for an image id, the image a translation draws instead (a title
// logo lettered in French, a sign in Spanish). The content keeps writing the source id everywhere; the asset bank
// (dom/assets.ts) draws the variant of the language being played, the asset graph caches every variant, so a player
// who switches language offline still has the images. Pure: no DOM, no engine.
import type { GameDef, Id } from './types';

/**
 * The swaps a language makes (`{ <source id>: <variant id> }`): none for the game's own language, nor for a language
 * that has no variant of any image.
 */
export function langImages(game: Pick<GameDef, 'lang' | 'i18n'>, lang: string | undefined): Record<Id, Id> | undefined {
  const all = game.i18n?.images;
  if (!all || !lang || lang === (game.lang ?? 'en')) return undefined;
  const out: Record<Id, Id> = {};
  for (const [id, by] of Object.entries(all)) {
    const v = by[lang];
    if (v) out[id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Every variant of an image, in any language (the asset graph caches them beside the source). */
export const imageVariants = (game: Pick<GameDef, 'i18n'>, id: Id): Id[] =>
  Object.values(game.i18n?.images?.[id] ?? {});
