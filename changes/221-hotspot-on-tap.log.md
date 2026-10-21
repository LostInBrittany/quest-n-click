## 4.3.1: a hotspot that acts on a single tap, onTap: 'go' (#221)

- `dom/input.ts` `tapVerb()`: a single tap with no verb picked acted only on exits (an exit's `onTap`, or the game's
  `input.exitOnTap`, #188); on any other hotspot it only walked. Found in a game whose cellar has an endless aisle:
  Use aisle says why one does not walk down it, but the player's first gesture, a single tap, walked the hero there in
  silence.
- `HotspotDef.onTap?: 'go' | 'walk'`, the exit's field on a plain hotspot: `go` returns the hotspot's `defaultVerb`
  from `tapVerb()`, `walk` (the default) returns null as before. `input.exitOnTap` is not read for a plain hotspot:
  it is about exits, and a game that sets it keeps its hotspots walk-only. A picked verb still wins.
- Input only: `ir-fields.ts` classes it `presentation`, so the logic fingerprint, the solver and saves do not move.
  The validator checks the value as it does an exit's (`tools/validate/player.ts`).
- Tests: `tests/dom/hotspot-on-tap.test.ts` (go acts on arrival, no onTap only walks even with `exitOnTap`, walk only
  walks, a picked verb wins, the validator). CONTENT_GUIDE in both languages, API.md regenerated.

→ next: review.
