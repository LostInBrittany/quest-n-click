### Changes

- **The game runs on its own origin** (4.2.1): a hosted Studio serves everything that runs the game on `playUrl`, never
  on the Studio's origin. The Studio opens it with a one-time ticket (`POST /api/play-ticket`). The game's access ends
  at the next request when the member is removed or their Studio session ends.
