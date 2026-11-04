// The portrait layout of a phone held upright (#397, 4.6.0, opt-in: `skin.portrait`). The scene takes the top, as wide
// as the screen and at its own 16:10 ratio; the panel below holds what the landscape column holds (the sentence line,
// the verbs, the bag, the tools row) and fits its height with the same rules (side-fit.ts). A phone upright is about
// twice as tall as it is wide, so the panel has room to spare; only a nearly square screen (a foldable, a split screen)
// is short of it, and there the scene gives up width first, down to a floor, before the panel's buttons go under a
// touch target. Below that floor the panel shrinks its buttons as the landscape column does, then scrolls.

/** The scene's ratio, as everywhere in the player (640 x 400 logical units). */
export const RATIO = 1.6;
/** The scene never gets narrower than this share of the screen's width to make room for the panel. */
export const MIN_SCENE_SHARE = 0.6;

export interface PortraitInput {
  /** Whether the game asked for the portrait layout (`skin.portrait`). */
  optIn: boolean;
  /** Whether the desktop layout applies (a fine pointer and a large window): it wins over everything. */
  desk: boolean;
  /** The content box, safe areas taken off. */
  width: number;
  height: number;
}

/** The portrait layout applies to a game that asked for it, on a screen taller than wide that is not a desktop. */
export function usePortrait(i: PortraitInput): boolean {
  return i.optIn && !i.desk && i.height > i.width;
}

export interface PortraitFitInput {
  /** The content box, safe areas taken off. */
  width: number;
  height: number;
  /** The panel's height with every button at a touch target (side-fit.ts's TOUCH): its chrome, the verb rows and the
   *  slot rows at 44 px (or square slots when they are smaller). */
  panelNeed: number;
}

export interface PortraitFit {
  /** The scene's width and height, px (whole pixels, at RATIO). */
  sw: number;
  sh: number;
  /** The panel's height, px: what the scene leaves of the screen's height. */
  panelH: number;
}

/** The scene's size and the panel's height for a screen held upright. */
export function fitPortrait(i: PortraitFitInput): PortraitFit {
  const width = Math.max(0, Math.floor(i.width));
  const height = Math.max(0, Math.floor(i.height));
  const result = (sw: number): PortraitFit => {
    const sh = Math.round(sw / RATIO);
    return { sw, sh, panelH: Math.max(0, height - sh) };
  };
  // Full width when the panel keeps its touch targets below it (every phone held upright).
  if (height - Math.round(width / RATIO) >= i.panelNeed) return result(width);
  // A nearly square screen: the scene narrows (centred, letterboxed) to leave the panel what it needs, down to a floor.
  const floor = Math.round(width * MIN_SCENE_SHARE);
  const fits = Math.floor((height - i.panelNeed) * RATIO);
  return result(Math.max(floor, Math.min(width, fits)));
}
