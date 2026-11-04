// The first visit's JavaScript against the game's budget, in bytes (4.6.0, #405): no rounding edge, so one byte over
// fails wherever the build sits, and the figures a person reads say KB with one decimal and the bytes.
import { describe, expect, it } from 'vitest';
import { firstVisitSize, overBudget, sinceRelease } from '../tools/first-visit';

describe("the first visit's budget", () => {
  it('fails one byte over the budget, and passes at the budget and under it', () => {
    expect(overBudget(140 * 1024, 140)).toBeUndefined();
    expect(overBudget(140 * 1024 - 300, 140)).toBeUndefined();
    expect(overBudget(140 * 1024 + 1, 140)).toBe(
      "first visit's JavaScript: 140.0 KB gzipped (143361 bytes), 1 byte over initialJsKB 140 (143360 bytes)",
    );
  });
  it('compares unrounded: 0.6 KB over is over, where rounding once said the same KB', () => {
    expect(overBudget(Math.round(140.4 * 1024), 140)).toMatch(/410 bytes over initialJsKB 140/);
  });
  it('holds nothing when the game sets no budget', () => {
    expect(overBudget(10 ** 9, undefined)).toBeUndefined();
  });
  it('says a size with one decimal and the bytes', () => {
    expect(firstVisitSize(141252)).toBe('137.9 KB gzipped (141252 bytes)');
  });
});

describe("the first visit since the release's baseline", () => {
  it('says how many bytes it grew or shrank, and nothing when it did not move', () => {
    expect(sinceRelease(141252, 141452)).toBe(
      "first visit's JavaScript: +200 bytes since the release (137.9 KB → 138.1 KB gzipped)",
    );
    expect(sinceRelease(141252, 141000)).toBe(
      "first visit's JavaScript: −252 bytes since the release (137.9 KB → 137.7 KB gzipped)",
    );
    expect(sinceRelease(141252, 141252)).toBeUndefined();
  });
});
