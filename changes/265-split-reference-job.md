### Changes

- **The reference chapter's Chromium work runs in three CI jobs side by side (4.5.0, #265)**: `reference (chromium)`
  keeps the build, the proofs, the keyboard run, visual, perf, weight, music and taps; the French and generic runs move
  to `reference-fr`, the hero choice example to `heroes`, both on the `reference` gate. The job that ended every run
  (about 15 min of sequential work) becomes three of 5 to 8 min; each rebuilds its game.
