### Added

- **`actorGap`: the hero's distance to a character follows their size**: without an `approach` point in the layout,
  the hero stopped 44 units from any character, so tall characters who gesture as they talk put a hand in each
  other's head. `actorGap` on the game (e.g. `0.8`) sets the distance to that share of the two characters' mean
  height, times the depth scale where the character stands; omitted, nothing changes, and an `approach` point still
  wins. `depthScale` and `scaleAt` move to `core/stage.ts`. Found while making "Jack cherche un taf".
