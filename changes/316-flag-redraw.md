### Fixed

- **A character's variant shows the moment its flag changes (4.5.4, #316)**: a `{ set }` in the middle of a
  conversation or a cutscene that switches a character's variant (a costume, a prop in the hair) only showed once the
  conversation ended: the room was redrawn on the engine's next change, not on the flag. The room now redraws on every
  `flagChanged` while it is shown.
