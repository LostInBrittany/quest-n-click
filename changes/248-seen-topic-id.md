### Fixed

- **`npm run validate` refuses a `seen` key that nothing records (4.5.5, #248)**: a topic with an id is recorded as
  `topic.<id>`, so `{ seen: 'house.grandma.0' }` (the positional form of the 3.x pages) was silently false in a
  schema 3 game. The validator now checks every `seen` key a condition reads or a checkpoint marks against the
  topics, `once` listeners, `once` choice options and Reality signals of the game; when the key is the old place of
  something that has an id, the error names the key to write (`topic.<id>`, `event.<id>`, `choice.<id>`).
  `create.conditions` (en, fr) no longer states it as a limit, and its key table lists `reality.<signal>`.
