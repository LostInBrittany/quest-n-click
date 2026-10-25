### Fixed

- **`npm run i18n -- extract` writes a custom minigame's texts (4.5.5, #250)**: the `textParams` a game's own minigame
  declares were left out of the locale files (only the built-in minigames' were written), so an author added their
  paths by hand and a later extract parked them as `_stale`. The extract, `i18n -- status` and the content report now
  read the game module's `minigames`, as the player and the validator already did.
