## i18n extract reads a custom minigame's textParams

`tools/i18n.ts` loaded the game module and kept only its `game`: `textPaths(game)` and `localeStatus(game, table)`
walked every `{ minigame }` with the built-in `textParams` table only, so a game's own minigame (`index.ts` exports
`minigames`) had no paths in the locale files, while `applyLocale` in `boot.ts`, given `o.minigames`, did translate
them (#250, stated as the LIMIT `custom-minigame-i18n-extract` in the 4.5.0 wiki). The CLI now passes the module's
`minigames` to the extract and the status; `localeStatus` takes them as a fourth argument, and `report` as an option
(`npm run validate -- --report`, the Studio's report), so a translated custom text is not counted as stale either.
The test builds a game folder in `.cache` whose `index.ts` exports a `duel` minigame and runs the CLI on it through
`$GAME_DIR`. The LIMIT is gone from create.custom-minigame (en, fr), whose contract step says the extract writes them.
Not in scope: the tools that apply a locale outside the player (hero-matrix, the voice checks) still read the built-in
`textParams` only; their checks are about hero lines and voices, not minigame params.

→ next: 4.5.5's release.
