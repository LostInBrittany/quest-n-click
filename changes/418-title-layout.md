### Changes

- **The title screen's logo and buttons placed by the game (4.7.0, #418)**: `titleScreen` takes `logoWidth`,
  `logoCenter` and `logoTop` (the logo's width, the x of its centre, the y of its top) and `buttonsTop` (the y of the
  top of New game and Continue), all in units of the 640 x 400 scene. A game no longer pads its logo image with
  transparent space to size and place it, and can move the buttons. Without them, the title is as before. Upright
  (`skin.portrait`), the buttons stay below the picture: `buttonsTop` applies only sideways.
