### Fixed

- **The phone layout's column fits a short landscape screen (4.3.2, #227)**: on a phone in landscape under its
  browser's bars (e.g. 844 × 320), the right-hand column was 300 px wide, each bag slot a square 87 px tall, the verbs
  44 to 56 px, and the tools row (map, pause, music) went out at the bottom of the screen; six items or more (the bag's
  page buttons) cut it on a 568 × 320 phone too. The column now fits its height: the slots stop being square first,
  then the verbs come down to 44 px, and only when 44 px no longer fits do verbs and slots share the room; the tools
  row never shrinks, and past a floor the column scrolls instead of cutting. The layout also reads the room inside the
  safe areas (notch, home indicator) instead of the whole screen. Nothing to change in a game.
