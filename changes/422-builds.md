### Changes

- **Published builds (4.2.2)**: a hosted Studio's Play tab publishes the head as an immutable, numbered build of the
  player's game, served at `/play/<n>/` on the game's origin; `/play/` is the last green build (its revision judged
  valid). Each build's manifest (revision, engine, snapshot and file hashes) is signed with the Studio's job key; an
  owner can rebuild one fresh and compare it byte for byte. `publicBuilds` (off by default) opens `/play/` without a
  session.
