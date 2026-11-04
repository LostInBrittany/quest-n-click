## a map without pins

The Great Racket's map is the author's drawing of the Léon, each place on a landmark he drew; the pins (a face in a
white-ringed disc above a needle, or the pin icon in the same disc without a `portrait`) hid it, and he asked that they
"simply not be there". No style hook let a game remove them.

`MapDef.pins` (`'faces' | 'hidden'`, default `'faces'`). With `'hidden'`, `openMap` (`dom/map-view.ts`) builds the same
buttons (`.pin`, with `aria-label`, the same width) with the class `bare`: an empty `span.face` instead of the image,
no needle, centred on `pos` (`translate(-50%, -50%)`) instead of hanging above it, no border nor background; the `news`
image keeps its place at the spot's corner, and `:focus-visible` rings the spot. A joined group keeps its row of
`facebtn`, one empty button per place. The validator refuses another value (`validate/map.ts`); the presentation
fingerprint takes `pins` (absent, the hash is unchanged). Tested in `tests/dom/map-hidden-pins.test.ts` (bare buttons,
news, the list, joins, the default, the validator); checked in Chromium on The Great Racket at 844 x 390.

→ next: nothing.
