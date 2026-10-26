### Fixed

- **`npm run ids -- --write` rewrites the positional `seen` keys of the sources (4.5.6, #359)**: a `{ seen: key }`
  condition or a checkpoint's `seen` key that names the old place of a topic, a `once` listener or a `once` choice
  option (`house.grandma.0`, `event.house.2`, `choice.house.<text>`) becomes the key the engine records once that
  thing has an id (`topic.<id>`, `event.<id>`, `choice.<id>`), in the files the tool writes (`rooms/*.ts`,
  `rules.ts`, `items.ts`, `game.ts`); the dry run lists each one with its line. Before, the save migration renamed
  them in the saves but the sources kept the old keys, which then named nothing (since 4.5.5 the validator said so,
  one key at a time). The Studio's hosted migration writes them too. Texts, flags and keys nothing renames stay as
  they are; a second run changes nothing.
