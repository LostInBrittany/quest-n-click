### Fixed

- **A reload during the New Game intro no longer skips it (4.6.0, #401)**: the autosave was written before the intro
  ran, so a reload while the intro's `choice` was open (the hero choice of `games/heroes`) left a Continue that
  resumed the first room with the hero's flag unset, and the player was never asked. A game with a `start.intro` now
  writes its autosave once the intro has ended, or once it hands the player the game with a tutorial step (`guide`,
  as the sample game's intro does): a reload before that leaves nothing to continue, and New game plays it again. A
  game without an intro saves at the start, as before. The save format is unchanged.
