## 4.4.0: the Studio's hero × language matrix

- An outside review asked for one view of what the data already implies: every hero's final text and clip, in every
  language. `src/engine/tools/hero-matrix.ts` (pure) builds it from what exists: the game's switched flags and their
  values (`gameSwitchFlags`, moved out of `src/studio/hero-picker.ts`, which re-exports it as `switchFlags`), the
  hero's variant per combination (`check` on a state built from the start plus the column's flags), `applyLocale`,
  `lineIds`, `renderText`, `voiceKey` / `lineClip` over each language's clips as boot.ts picks them (`langVoices`,
  else the game's own: `borrowed`), and `switchesKept` (now exported from i18n.ts) for a lost agreement.
- Exposed as `GET hero-matrix` (studio-server ops/core.ts + routes.ts, a reviewer's read), `api.heroMatrix` (server
  and `BrowserApi`, over `mod.locales`), and the Voices tab's view switch (`src/studio/hero-matrix.ts`); the demo,
  which has no recording table, opens on the matrix. Not an MCP tool: the voice table is not one either.
- Choices: no "(unset)" column (the plain clip before the choice is the voice table's business); a voiced language
  only flags missing clips (a game without any voice says nothing); columns capped at 24 combinations (`truncated`).
- Tests: `tests/hero-matrix.test.ts` (the matrix on the heroes fixture and its French "Ready?", the server, its route
  and the demo alike), `tests/dom/studio-hero-matrix.test.ts` (headers, cells, filters, the tab's switch).
→ next: a human pass on the Voices tab's matrix with the heroes example.
