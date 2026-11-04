## The hero choice screen: `{ choice, screen }`

The maintainer asked for a hero choice screen at New Game: the heroes in a scene made for it, the player taps one. Two
of his games need it (the korrigan or the korriganez, Adrien or Adrienne). First tried with content only on
`games/heroes`: a "choose" room with `hero: false`, the heroes as actors, a rule per actor that sets `form` and goes to
the garden. It validates and is proved, but a single tap only names a hero ("Walk to Biscuit"), the verbs, the bag and
the buttons stay, "Look at" a hero picks it, the actors need typed coordinates and copies of the hero's looks, and the
screen reader gets the scene's hotspots. So the screen became a presentation of the choice it already was:
`screen: { decor, title? }` on the command (`ChoiceScreen`), passed to `Presenter.choose` as a third argument with its
title filled; `dom/choice-screen.ts` draws it over the scene in the title screen's full-width layout; the handler does
not say the pick back on a screen (the line came before the `do` that sets the hero, in the old look). The IR drops it
like `Choice.img`, the presentation fingerprint carries it only when a game has one. `games/heroes` asks with it; its
e2e checks the screen (title per language, the side column hidden, the heroes' images, the focus) and still plays the
six runs. Seen at 844 × 390 and 1280 × 800. A side finding left for its own issue: a reload while the intro's choice is
open, then Continue, lands in the first room with the flag unset (the autosave is written before the intro).

CI said the first visit grew 137 → 138 KB gzipped (main sat at 137.33 KB, 177 bytes under the rounding; the
screen added 484): `dom/choice-screen.ts` is now imported when a choice has a `screen`, and the first visit is back to
137.44 KB.

→ next: the maintainer's look on a phone; the reload during the intro's choice as its own issue.
