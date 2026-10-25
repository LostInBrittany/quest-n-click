### Fixed

- **A voiced line whose clip cannot play stays on screen for its reading time (4.5.5, #249)**: before the player's
  first gesture, with the sounds off, the voice volume at 0, or a clip that fails to load or play, the speech bubble
  used to close at once; it now shows for the reading time an unvoiced line gets (what remains of it when the clip
  fails late). A clip that plays still sets the line's length, and a tap still skips it. `create.voices` (en, fr) no
  longer states it as a limit.
