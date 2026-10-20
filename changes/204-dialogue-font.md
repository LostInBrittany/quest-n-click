### Changes
- **A proportional pixel font for the interface (4.2.5, #204).** The default `--font-ui` is now Galmuri11 (OFL 1.1, a
  125 KB Latin subset) instead of DotGothic16, a Japanese face whose fixed-width Latin left gaps around `i` and `l` and
  set the period a pixel above the line. Galmuri11 has a narrow `i`, a wide `m` and a period on the baseline, close to
  the LucasArts dialogue fonts, and a `size-adjust` keeps a game's text at the same size. DotGothic16 now stands behind
  every interface family, so Japanese text and the few symbols Galmuri11 lacks still render. A game that wants the old
  look sets `skin.fonts.ui: 'DotGothic16'`; a game that already sets `skin.fonts.ui` sees no change.
