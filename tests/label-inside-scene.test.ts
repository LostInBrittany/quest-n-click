// The name of a thing (dom/input.ts, `showLabel`): centred above it, moved inward when it would run past the scene's
// edge (#414: "path to Le F" at the right edge of The Great Racket's heath).
import { describe, expect, it } from 'vitest';
import { labelLeft } from '@engine/dom/input';

// A scene 844 px wide (u = 844 / 640), a label 160 px wide, a margin of 4 units.
const u = 844 / 640;
const sw = 640 * u;
const m = 4 * u;
const w = 160;

describe('labelLeft', () => {
  it('keeps the label centred on its thing when there is room', () => {
    expect(labelLeft(sw / 2, w, sw, m)).toBe(sw / 2);
    expect(labelLeft(m + w / 2, w, sw, m)).toBe(m + w / 2);
    expect(labelLeft(sw - m - w / 2, w, sw, m)).toBe(sw - m - w / 2);
  });
  it('moves it inward near the right edge, its right side a margin from the edge', () => {
    const x = labelLeft(sw - 10, w, sw, m);
    expect(x + w / 2).toBeCloseTo(sw - m);
  });
  it('moves it inward near the left edge, and past it', () => {
    expect(labelLeft(5, w, sw, m) - w / 2).toBeCloseTo(m);
    expect(labelLeft(-40, w, sw, m) - w / 2).toBeCloseTo(m);
  });
  it('starts a label wider than the scene at the left margin', () => {
    expect(labelLeft(sw / 2, sw * 2, sw, m) - sw).toBeCloseTo(m);
  });
});
