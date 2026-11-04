## a child region of the map before any of its places is open

The Great Racket's Léon has the Côte des Légendes as its child region; its three places open only when the bells ring.
From the first map, "The coast ⤡" showed and led to an empty coast. `openMap` (`dom/map-view.ts`) took the first region
whose `parent` was the shown one, whatever was unlocked. The game had also painted the coast's `frame` into the Léon's
picture, because nothing in the engine drew it.

`openRegions` (pure, tested) marks a region open when an unlocked place is in it or below it (walking up the parents),
plus the region the map opens on and `start`, so the player can always zoom back to where they stand. Only open child
regions get the zoom button and their `frame`, now an SVG outline on the parent's image. The zoom buttons sit in one
column, the way down above the way up, so a region in the middle of three levels can go both ways (it could only go
up). No sample game has a child region: the fix is the default, not an option. Tested in
`tests/dom/map-open-regions.test.ts` (hidden while closed, shown once a place opens, two levels down, the region the
map opens on kept); checked in Chromium on The Great Racket at 844 x 390.

→ next: nothing.
