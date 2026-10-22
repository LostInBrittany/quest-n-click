### Changes

- **A playable example of choosing the hero (4.4.0)**: `games/heroes`, "Who Am I Today?", one garden and one puzzle
  for every 4.3 hero-choice feature at once. Three heroes on portrait cards at New Game (Pixel, Biscuit, Gaby the
  gull), their names in the lines (`{hero}`), Grandma's words switched for each (`{form?…}`), one rule only the gull
  gets, English and French (the French table adds its own agreements: `Prête` for the gull), Grandma's lines voiced
  per hero in both languages (`garden.dust~form=gull` in `audio.voices` and `audio.voicesByLang.fr`), and a save that
  keeps the hero. The sample game's art. `GAME=heroes npm run dev` plays it, `GAME=heroes npm run solve -- --prove`
  proves it for every hero, `npm run e2e -- <url> --game heroes --prod` picks each hero on its card in English and in
  French, saves, reloads, continues and finishes (in CI's `reference` job). CONTENT_GUIDE's hero section points to it.

### Fixed

- **A translation's voice clips ship with the game (4.4.0)**: `npm run assets` encoded only `audio.voices`, so the
  clips of `audio.voicesByLang` (a French recording) never reached `public/assets/audio/voices/` and a French page
  played nothing. They are now prepared like the others (keyed `<lang>:<id>` in `assets.gen.json`).
- **`npm run voices -- check` reads each language's own text (4.4.0)**: 4.3.1 taught `status` that a clip keyed on a
  switch only the translation has (`Reviens sain{form?gull=e|*=} et sau{form?gull=ve|*=f} !`) belongs to that line;
  `check` still read the source text and warned "a clip no line claims".
- **`npm run e2e` in two languages in one run (4.4.0)**: the e2e harness kept the verb labels of the first page it
  read, so a game script that reloaded the page in another language (`?lang=fr`) tapped the English labels. It reads
  them again after each load.
