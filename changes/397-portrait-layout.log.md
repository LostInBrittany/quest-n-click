## Portrait layout: a phone held upright, opt-in per game (`skin.portrait`)

The maintainer plays the label's games on phones, often upright and tired, on planes, and asked for his adventure games
to play upright. Until now an upright touch screen showed only the rotate overlay. A game now opts in with
`skin.portrait: true` (the skin holds `pixelArt`, a similar presentation switch; `layout` would be confused with the
rooms' layouts). `layout()` reads it live, so the overlay and the layout follow the game definition on every resize,
which is also how the e2e switches it on in the running sample game, which keeps it off. Upright: the scene on top at
full width, the panel below with the sentence line moved into it (as on the desktop), the verbs on 3 columns and the bag
on 4 (`invCols`, as the desktop), the tools and page buttons 44 px tall. `fitPortrait` (pure, `dom/portrait-fit.ts`)
gives the scene the full width when the panel keeps its touch targets, else narrows it down to 60% of the width; the
panel's need is measured by the same `measureSide` that `fitSideColumn` uses (taken out of it, landscape arithmetic
unchanged), with the panel's top border and without the bag's page buttons, so the scene's size depends on the screen
alone and does not jump when the ninth item arrives (a full bag on a short screen shrinks the panel's buttons to 34 to
36 px, as #227 accepted in landscape). Menus (`.dim`) are `position: fixed` upright, padded by `#app`'s padding
(`--safe`); the title screen lets its buttons out under the picture, in a column. The title screen is now laid out again
on a resize (`onTitle`, `titleFit`), a fix for landscape too. Measured in Chromium (touch, DPR 2) on the demo at 360×640
to 430×932 with and without simulated safe areas (#397): full-width scene everywhere but 360×640 with a 47/34 px notch
and indicator (352 px, verbs and slots 44); landscape 568×320 to 932×430 and desktop 1280×800 and 1440×900 identical to
main, box for box. `tests/portrait-fit.test.ts` and a validator case; `npm run e2e:portrait`.

→ next: WebKit and a real iPhone and Android phone upright (safe areas from `env()`, the browser bars), minigames at a
phone's width (they run in the scene, at its `u`), and whether the sample game should turn the option on.
