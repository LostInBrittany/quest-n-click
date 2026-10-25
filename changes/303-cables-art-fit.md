### Changes

- **`cables` fits a game's own plug and board art**: the plug's tip direction (120°), the sockets' place on the board
  (a quarter of its width, four fixed heights) and a connected plug's place (on its socket) suited the sample art only;
  plugs drawn pointing right were turned the wrong way, and long plugs stuck their pins out of the board. Four optional
  params, `tipDeg`, `socketX`, `socketY` and `plugInset`, default to the old values. Found while making "Jack cherche
  un taf".
