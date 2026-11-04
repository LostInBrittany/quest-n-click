### Fixed

- **Main green again after the routes (4.6.0, #403)**: the nightly's gated `core` mutation set left four mutants
  unexplained on the routes' side of `save.ts` and `session-runtime.ts`, and the `coverage` ratchet refused
  `world.ts`'s branch floor. `tests/route-runtime.test.ts` and `tests/routes-game.test.ts` join `TESTS.core`, two
  tests pin a save held at a closed exit and a replayed entry's last recorded tick, and the floor is 86. `core`:
  435/438, the 3 survivors explained. Nothing changes for a player, an author or a host.
