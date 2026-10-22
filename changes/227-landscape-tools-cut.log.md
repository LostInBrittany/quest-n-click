## 4.3.2: the phone column fits a short landscape screen (#227)

- `dom/shell.ts` `layout()`: the column's width is `W - 1.6 × H` (176 to 300 px), the verbs a fixed `max(44, min(56,
  12% of H))` px, the slots squares a third of the column wide (`.slot { aspect-ratio: 1 }`). Nothing tied the sum to
  the height: on a wide and short screen (a phone in landscape with its browser's bars, 844 × 320) the stack reached
  387 px and the tools row, pushed last, left the screen. Reported on a phone playing a game in production; our
  844 × 390 screenshots fit, which is why it went unseen.
- The fix: `dom/side-fit.ts` `fitSide()`, pure, from the column's height and what is neither a verb row nor a slot row
  (measured by `fitSideColumn()`: padding, gaps, the tools row as the fonts draw it, the bag's page buttons when they
  show). Order of sacrifice: the slots' squareness (`.inv.fit`, a `--slot-max` height), the verbs' comfort (down to
  44 px), then an even share, never under 24 px. `renderInv` refits when the page buttons show or hide. The tools row
  and the page buttons are `flex: none`; `.side` scrolls past the floor rather than cutting.
- Also: `layout()` read `#app`'s border box, safe-area padding included; it now reads the content box, so the game no
  longer overflows into the notch or the home indicator.
- Measured (Playwright, touch Chromium, DPR 2, demo `?dev&at=house`): 568 × 320, 640 × 360, 667 × 375, 740 × 360,
  812 × 375, 844 × 390, 932 × 430 unchanged; 844 × 320 and 844 × 300 now fit (44/50 and 42/42 px verbs/slots), and
  with nine items 568 × 320 and 844 × 320 too; the desktop layout is untouched.
- Tests: `tests/side-fit.test.ts`, the order of sacrifice and the column's total against the height.

→ next: review.
