## a map without pins, or with small dots

The Great Racket's map is the author's drawing of the Léon, each place on a landmark he drew; the pins (a face in a
white-ringed disc above a needle, or the pin icon in the same disc without a `portrait`) hid it, and he asked that they
"simply not be there". No style hook let a game remove them. Seen bare, he asked for a middle way: a small token per
place, and the hero standing where they are.

`MapDef.pins` (`'faces' | 'hidden' | 'dots'`, default `'faces'`). `hidden` and `dots` are bare: `openMap`
(`dom/map-view.ts`) builds the same buttons (`.pin.bare`, with `aria-label`, the same width) with an empty `span.face`
instead of the image, no needle, centred on `pos` (`translate(-50%, -50%)`) instead of hanging above it, and the route
runs from spot to spot (no 2% lift for a needle's tip); the `news` image keeps its corner; a joined group keeps its row
of `facebtn`, one button per place. `dots` adds `.dot` in each face (CSS: a cream disc, dark outline, drop shadow,
40% of the zone; or `img.dot` from `map.vehicles.dot`, pixelated), a warm glow on `:hover` / `:focus-visible` (the
scale-up dropped under `prefers-reduced-motion`), and on the current place, instead of its dot, `.standing`: the hero's
first `idle` frame through `RoomView.characterImage` (#424), 12% of the map's height like the walker, feet on the spot,
an ellipse shadow, the spot's "!" beside the head. `go()` removes it when the journey starts and, on arrival, removes
the walker or vehicle and stands the hero on the new place, flipped as the walker last was. Only `dots` has the
standing hero: on `faces` the current face is ringed already, `hidden` is meant to draw nothing. The validator refuses
another value (`validate/map.ts`); the presentation fingerprint takes `pins` (absent, the hash is unchanged). The
branch merges #424 (the walker and `characterImage`). Tested in `tests/dom/map-hidden-pins.test.ts` (bare buttons,
news, the list, joins, the default, dots, the dot image, no idle frame, the hand-over on a journey, the validator);
checked in Chromium on The Great Racket at 844 x 390 (dots, hover, the hero on the beach).

→ next: nothing.
