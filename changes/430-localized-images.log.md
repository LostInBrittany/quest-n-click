## images per language

The Great Racket, translated into French and Spanish, kept its English title screen: the logo is the title lettered on
a ribbon (`titleScreen.logo`), and the engine drew an image id the same in every language. The author lettered
`logo/fr` and `logo/es` at the same size.

A general swap rather than a per-language `titleScreen.logo`: `GameDef.i18n.images` (`{ <id>: { <lang>: <id> } }`).
`tools/refs.ts` lists every variant, so `npm run assets` prepares them. `core/lang-images.ts`: `langImages(game, lang)` (the swaps of a translation, none for the game's own language) and
`imageVariants`. Every image URL goes through `AssetBank.img`, so the bank holds `swap` (set by the `App` from
`languages.current`) and `img` and `size` follow it; `file(id)` is the file's own URL, which the warm-up
(`dom/update.ts`) now caches by. The asset graph adds every variant wherever the source is (title, rooms, map, game,
offline): a player who switches language offline has them. The validator checks the ids exist and warns of a variant
for the game's own language or a language without a locale. The presentation fingerprint reads `i18n.images` only when
set; `i18n` stays `meta` in `ir-fields` (`same` stays out of the IR). Tested in `tests/dom/i18n-images.test.ts`;
documented in create.translations (EN, FR, `#i18n-images`). Checked in Chromium on The Great Racket at 844 x 390
(`?lang=fr`, `?lang=es`, plain, and the Settings switch).

→ next: nothing.
