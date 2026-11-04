## 4.6.0: the autosave waits for the end of the New Game intro (#401)

- Found while working on #398: on `games/heroes`, New game, reload while the hero cards are open, Continue: the garden
  with `form` unset, the intro never asked again.
- Cause: `Engine.newGame()` wrote the fresh state to the store before the intro, and `enter()` wrote it again on the
  first room's arrival. `continueGame()` loads the room without the intro.
- Fix: with a `start.intro`, `Engine.save()` keeps checking the objectives but writes nothing until the intro has
  ended. The flag lives on the busy owner (`Busy.intro`, `opening()` at New game, `opened()` around the intro's
  commands, cleared by `reset()` on any new session), which keeps `core/engine.ts` at its 800 lines. The end of the
  intro's `run` saves once. The title screen and Restart already clear the store before New game, so a reload during
  the intro finds no save. Without an intro, nothing changes. No save format change, no `saveVersion` bump.
- games/heroes/e2e.mjs: the first round reloads the page while the cards are open, checks Continue is disabled, and
  starts New game again.
- tests/intro-reload.test.ts: no autosave while the choice is open and the pick saved after it; an intro without a
  choice; a game without an intro saved at the start. The first two failed before the fix.
- CI red on the pull request (e2e chromium full, e2e webkit generic, pwa-firefox): the sample game's intro ends in its
  tutorial (three `guide` steps), so the whole tutorial was played with no autosave at all, and e2e-pwa and e2e-music
  (game) saved from code while the intro's first line was on screen and found no save. Fix: `Busy.holding` (the
  intro, and no tutorial step waited for) is what `save()` checks; a `guide` reached during the intro writes the
  autosave, the player's guess in it. tests/intro-reload.test.ts: the demo's intro saved at its first tutorial step,
  a save during the tutorial written (red before). The two scripts Skip the intro and answer its choice before they
  save. routes (webkit): not this change (the same commit's run of routes (chromium) passed; see the report).
- Left: the revision dialog's Restart (`dom/revision.ts`) calls `newGame()` without clearing the store, so a reload
  during that intro would continue the previous game rather than none.
→ next: nothing.
