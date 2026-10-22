## 4.4.0: a playable example of choosing the hero (games/heroes)

- The outside review of 4.3 asked for "un petit exemple réellement jouable, avec plusieurs héros et deux langues".
  `games/heroes` ("Who Am I Today?") is one room, the demo's garden and art (D13; only `cat/r1c1`, `extras/r2c4` and
  `extras/r2c5` are new in `public/assets/img`): one hero character (Pixel) with two variants (Biscuit, Gaby the gull)
  read from `form`, set by the intro's three portrait cards. Grandma greets each by name with her own words, French
  agrees what English does not (`Prêt{form?gull=e|*=}`, the farewell `sain{form?gull=e|*=} et sau{form?gull=ve|*=f}`),
  her dust line has a clip per hero in English and in French, and her farewell one English clip, the gull's own in
  French and the plain one for the cats. The clips are a babble synthesised by `games/heroes/audio/babble.py`
  (provenance: stand-ins). `validate --release`, `solve --prove`, `i18n status`, `voices check`, `lint` and
  `build:game` are clean; `provenance.lock.json` locks the 81 files.
- The solver merges the heroes (the flag only feeds texts and looks): the proof has 3 states. `tests/heroes-game.test.ts`
  shows it still goes down each card (a gate only one hero may open still finishes; a gate for nobody does not), then
  plays the 3 heroes × 2 languages through the engine (names, lines, clips), and a French save continued in a new
  engine.
- The example found three gaps, fixed here: `tools/refs.ts` never listed `voicesByLang`, so `npm run assets` never
  shipped a translation's clips (the player looks them up by file name: they 404ed); `tools/voices.ts check` called
  `orphanClips` without the localized game (4.3.1 fixed `status` only); `scripts/e2e/lib.mjs` cached the verb labels
  across page loads.
- Browser: `games/heroes/e2e.mjs`, from the real title screen, for en then fr (`?lang=fr`) and each hero: the three cards
  with their images, the hero's own line, its name on the engine's character, Grandma's greeting and dust line (the
  clip id spied on `App.audio.voice`), the key, a reload and Continue (same hero, same key), the farewell and its clip,
  the ending; in French no English default visible. Wired into the `reference` job (Chromium, after the chapter's own
  steps: its build replaces the chapter's); `tools/ci-plan.ts` sends `games/heroes/` and `games/demo/` (which the
  example reads) to that gate. Played locally on a production build in Chromium only.
→ next: the first human passes of the example (a phone, both languages, the three heroes), then the Studio's hero ×
language matrix.
