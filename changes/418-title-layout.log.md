## the title screen's logo and buttons placed by the game

The Great Racket wants its title buttons lower (80% of the scene's height) than the fixed 73% of `showTitle`
(`dom/menus.ts`), and padded its logo image with transparent space (and a nearly transparent pixel in two opposite
corners, so the asset build's crop keeps it) to make it smaller and lower than the fixed 430 units at x = 155, y = 8.

`titleScreen` gains four optional numbers in scene units: `logoWidth` (430), `logoCenter` (370), `logoTop` (8) and
`buttonsTop` (292). `titleLayout` (pure, tested) turns them into the percentages `showTitle` already used; without
fields it gives the exact same strings as before. Upright, style.css still puts the row below the picture with
`!important`, so `buttonsTop` applies only sideways; the logo's fields apply in both. Checked in Chromium on The Great
Racket's title at 844 x 390 and on a Pixel 7 upright.

→ next: nothing.
