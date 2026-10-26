### Changes

- **A created project has a test from the start: `npm test` (4.5.6, #384)**: `npm init @quest-n-click` (`quest-n-click
  create`) used to leave the template's `tests/` out, so a new project had no test, no vitest and no `npm test`,
  although `@quest-n-click/engine/testing` is there for a game's own tests. It now writes `game/tests/game.test.ts`
  (the game can be finished from a new game, and a save reads back as written), a `vitest.config.ts` with no alias
  (the package's `exports` resolve `/testing`), and in `package.json` `"test": "vitest run"` with `vitest` as a
  development dependency, at the engine's own version. The test names no room: it uses the `layouts` that
  `game/index.ts` builds from `layout/*.json`, and it does not wait for a new game that ends on a guided action. It is
  the template's own `tests/game.test.ts`, which the engine repository runs with `GAME=_template`: one file for both.
  An existing project adds the same three files by hand ([layout of a created
  project](https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Project-Layout)).
