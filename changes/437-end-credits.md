### Changes

- **An end that rolls the credits, shows the title, and lets the world go on (4.7.0, #437)**: `{ end: true }` takes
  `credits` (the game's `credits` roll, as from the pause menu; a tap ends them sooner), `title` (then the title
  screen) and `keepPlaying`. With `keepPlaying`, the end is still reached and saved (the solver's goal, the replays,
  `endingReached`), but a load (Continue, a save slot) clears it: the player is back in the world after the end, its
  rooms, scripts and sequences running. Before, a loaded end left a world where room scripts never ran and every
  sequence stopped after its first command. A plain `{ end: true }` is unchanged. The validator refuses `credits`
  without `credits` lines; the Studio's form has the three switches; `FakePresenter` logs `END`, then `CREDITS` and
  `TITLE`. API: `Presenter.end` takes an optional `EndShow` (`{ credits, title }`), exported from
  `quest-n-click/player`; `GameState.keepPlaying` (optional). Additions only.
