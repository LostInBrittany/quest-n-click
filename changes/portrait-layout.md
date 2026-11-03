### Changes

- **A portrait layout for a phone held upright, opt-in per game (4.6.0)**: a game that sets `skin.portrait: true` no
  longer shows the "rotate your phone" overlay on a screen taller than wide. The scene goes on top, as wide as the
  screen and at its 16:10; below it a panel holds the sentence line, the verbs (3 columns), the bag (4 columns), its
  page buttons when needed and the tools row (map, pause, music) at the bottom, every button 44 px or more. The panel
  fits its height with the landscape column's rules (`side-fit.ts`); only a nearly square screen (a foldable, a split
  screen) narrows the scene, down to 60% of the width (`dom/portrait-fit.ts`, pure and tested). Conversation choices
  and the map's places take the panel as they take the column; the pause menu, settings, save slots and confirmations
  take the whole screen inside the safe areas, with 44 px rows; the title screen puts its buttons under the picture.
  Turning the phone switches layouts as the game plays, its state untouched, the title screen included. A game without
  the field is unchanged, overlay included, and the landscape and desktop layouts measure the same as before. The
  validator wants `true` or `false`. `npm run e2e:portrait` measures it on the sample game.

### Fixed

- **The title screen follows a resize (4.6.0)**: turning a phone or resizing the window while the title screen showed
  laid out the game's screen under it (the scene sized for the right-hand column, the column hidden); the title now
  lays itself out again, its logo, buttons and footer included.
