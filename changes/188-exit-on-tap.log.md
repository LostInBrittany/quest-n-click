## 4.2.4: an exit gone through on a single tap (#188)

- `GameDef.input.exitOnTap` (a new `input` block, presentation) and `ExitDef.onTap: 'go' | 'walk'` (presentation):
  `core/ir-fields.ts` classes both, `core/fingerprint.ts` hashes both with the presentation, the IR leaves them out.
- `dom/input.ts` `actOnTarget`: a single tap with no verb on an exit that goes on tap (`tapVerb`: the exit's `onTap`,
  else the game's switch; the generated hotspot of an exit is read through its exit) walks to the approach point as
  before, then acts with `defaultVerb` on arrival. The walk stays a plain walk (the engine is not busy), so a tap
  elsewhere redirects the hero: `App.taps` counts the taps on the scene, and the act runs only if none came, no verb
  or item was picked, the engine's state is the same object (a save loaded, a new game or a checkpoint replaces it)
  and its room is the one the tap was made in. A double tap during the walk acts once, as before.
- The Studio: the sheet of an exit's hotspot has a "single tap" select (the game's setting, go through, walk there),
  written to `exits.<id>.onTap` through the guarded write.
- Tests: `tests/dom/exit-on-tap.test.ts` (without the switch it only walks; with it the room changes; `walk` keeps an
  exit walk-only, `go` works without the switch; Look still looks; a tap elsewhere, a room change or a save loaded
  during the walk cancels, each failing without its guard; a double tap acts once; the validator's checks),
  `tests/dom/studio-rooms-sheet.test.ts` (the select).
- The validator (`tools/validate/player.ts`, split out of `tools/validate.ts` with the save and settings menus' texts,
  1,113 → 1,096 lines, its cap in `tests/file-size.test.ts` lowered to match): `input` an object, `input.exitOnTap` a
  boolean, an exit's `onTap` `go` or `walk`.
- D46 (`docs/dev/DECISIONS.md`): the maintainer allowed the two fields in 4.2.4; D40's freeze of the content format
  admits optional presentation-only fields that need no schema, save or IR change. `docs/dev/DSL-STABILITY.md` says it.
- The first visit's JavaScript: 133 KB → 134 KB gzipped in `tests/quality-baseline.json` and the READMEs (+110
  bytes for `tapVerb` and the tap count in `dom/input.ts`: main measured 133.45 KB, this crosses the rounding to 134).
- Left as is: the sentence line still says "Walk to <exit>" before a tap that goes through, as the classics did.

→ next: the maintainer's review; Jack cherche un taf turns the switch on.
