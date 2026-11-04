// Where the title screen puts its logo and its buttons (dom/menus.ts, `titleLayout`, #418): in percent of the
// 640 x 400 scene, today's places by default, the game's own when `titleScreen` gives them.
import { describe, expect, it } from 'vitest';
import { titleLayout } from '@engine/dom/menus';

const n = (pct: string) => Number.parseFloat(pct);

describe('titleLayout', () => {
  it('keeps the places of every version before it when no field is given', () => {
    // The exact strings the title screen wrote before the fields existed.
    const before = {
      logo: {
        left: `${((370 - 215) / 640) * 100}%`,
        top: `${(8 / 400) * 100}%`,
        width: `${(430 / 640) * 100}%`,
      },
      buttonsTop: '73%',
    };
    expect(titleLayout()).toEqual(before);
    expect(titleLayout({})).toEqual(before);
  });

  it('places the logo by its width, its centre and its top, in scene units', () => {
    const { logo } = titleLayout({ logoWidth: 300, logoCenter: 320, logoTop: 48 });
    expect((n(logo.width) / 100) * 640).toBeCloseTo(300);
    expect((n(logo.left) / 100) * 640).toBeCloseTo(170);
    expect((n(logo.top) / 100) * 400).toBeCloseTo(48);
  });

  it('keeps the defaults of the fields not given', () => {
    const { logo, buttonsTop } = titleLayout({ logoTop: 40 });
    expect((n(logo.width) / 100) * 640).toBeCloseTo(430);
    expect((n(logo.left) / 100) * 640 + 215).toBeCloseTo(370);
    expect(buttonsTop).toBe('73%');
  });

  it('puts the buttons row at the y given', () => {
    expect(titleLayout({ buttonsTop: 320 }).buttonsTop).toBe('80%');
    expect(titleLayout({ buttonsTop: 0 }).buttonsTop).toBe('0%');
  });
});
