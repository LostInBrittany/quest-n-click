// The portrait layout of a phone held upright (dom/portrait-fit.ts, `skin.portrait`): the scene on top at full width,
// the panel below it with every button at a touch target; a nearly square screen narrows the scene first, down to a
// floor; a game that did not ask, a desktop or a landscape screen never gets it.
import { describe, expect, it } from 'vitest';
import { fitPortrait, MIN_SCENE_SHARE, RATIO, usePortrait } from '@engine/dom/portrait-fit';
import { fitSide, TOUCH } from '@engine/dom/side-fit';

// The panel as the demo draws it upright (measured in Chromium at 360 x 640): the sentence line 19, padding 16,
// 4 gaps of 6, the tools row 44, verb gaps 4, bag border and padding 12, slot gap 4 = 123; 9 verbs on 3 rows, 2 rows
// of slots, square slots of (W - 16 - 12 - 3 x 4) / 4; the panel's top border 2 on top of what it shares out.
const chrome = 123;
const square = (w: number) => (w - 16 - 12 - 12) / 4;
const need = (w: number) => 2 + chrome + 3 * TOUCH + 2 * Math.min(TOUCH, square(w));

describe('usePortrait', () => {
  it('applies to a game that asked for it, on a screen taller than wide that is not a desktop', () => {
    expect(usePortrait({ optIn: true, desk: false, width: 390, height: 844 })).toBe(true);
  });
  it('never applies to a game that did not ask (the rotate overlay stays), to a desktop or to landscape', () => {
    expect(usePortrait({ optIn: false, desk: false, width: 390, height: 844 })).toBe(false);
    expect(usePortrait({ optIn: true, desk: true, width: 800, height: 1000 })).toBe(false);
    expect(usePortrait({ optIn: true, desk: false, width: 844, height: 390 })).toBe(false);
    expect(usePortrait({ optIn: true, desk: false, width: 500, height: 500 })).toBe(false);
  });
});

describe('fitPortrait', () => {
  // Common phones held upright, CSS pixels, without and with a notch and a home indicator (47 + 34 px).
  const phones: [number, number][] = [
    [360, 640],
    [375, 667],
    [390, 844],
    [412, 915],
    [430, 932],
    [390, 844 - 47 - 34],
    [430, 932 - 59 - 34],
  ];

  it('gives the scene the full width at 16:10 on every common phone, and the panel what is left', () => {
    for (const [w, h] of phones) {
      const f = fitPortrait({ width: w, height: h, panelNeed: need(w) });
      expect(f.sw, `${w} x ${h}`).toBe(w);
      expect(f.sh).toBe(Math.round(w / RATIO));
      expect(f.sh + f.panelH).toBe(h);
      expect(f.panelH).toBeGreaterThanOrEqual(need(w));
    }
  });

  it('leaves room in the panel for verbs at 44 px or more and the tools row (fitSide on the panel)', () => {
    for (const [w, h] of phones) {
      const f = fitPortrait({ width: w, height: h, panelNeed: need(w) });
      const s = fitSide({ height: f.panelH - 2, chrome, verbRows: 3, slotRows: 2, slotSquare: square(w) });
      expect(s.verbH, `${w} x ${h}`).toBeGreaterThanOrEqual(TOUCH);
      expect(2 + chrome + 3 * s.verbH + 2 * (s.slotMax ?? square(w))).toBeLessThanOrEqual(f.panelH);
    }
  });

  it('narrows the scene on a nearly square screen so the panel keeps its touch targets', () => {
    const w = 600,
      h = 640; // a foldable unfolded, a split screen
    const f = fitPortrait({ width: w, height: h, panelNeed: need(w) });
    expect(f.sw).toBeLessThan(w);
    expect(f.sw).toBeGreaterThanOrEqual(Math.round(w * MIN_SCENE_SHARE));
    expect(f.panelH).toBeGreaterThanOrEqual(need(w));
    expect(f.sh).toBe(Math.round(f.sw / RATIO));
  });

  it('never narrows the scene under the floor: past it the panel shrinks its buttons, then scrolls', () => {
    const f = fitPortrait({ width: 500, height: 520, panelNeed: 400 });
    expect(f.sw).toBe(Math.round(500 * MIN_SCENE_SHARE));
    expect(f.panelH).toBe(520 - f.sh);
    expect(f.panelH).toBeLessThan(400);
  });

  it('works in whole pixels and never returns a negative panel', () => {
    const f = fitPortrait({ width: 390.6, height: 100.4, panelNeed: 300 });
    expect(Number.isInteger(f.sw) && Number.isInteger(f.sh) && Number.isInteger(f.panelH)).toBe(true);
    expect(f.panelH).toBeGreaterThanOrEqual(0);
  });
});
