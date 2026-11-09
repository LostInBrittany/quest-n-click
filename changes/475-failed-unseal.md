### Fixed

- **A sealed ending that could not be opened no longer ends the game (next, #475)**: a mistyped password, or the sealed
  file unreachable offline, showed "…" and still saved the game as finished, so that save could never show the ending.
  The game now goes on and nothing is saved as finished. A wrong typed password is asked again, and an empty answer
  gives up. For a host: `Presenter.ending('open')` may return `false` when nothing was unsealed; a presenter that
  returns nothing behaves as before.
