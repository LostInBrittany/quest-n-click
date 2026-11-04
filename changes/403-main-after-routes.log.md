## main green again after the routes: four `core` mutants and the `world.ts` floor

#403: main was red since #394 for two causes. The nightly's gated `core` set left four mutants unexplained, all on the
routes' side of `save.ts` (`route.on`, `route.blocked`) and `session-runtime.ts` (`sync(true)` and `onEnd` at an
entry's end): the set's tests never loaded a game with routes. `tests/route-runtime.test.ts` and
`tests/routes-game.test.ts` join `TESTS.core`, which kills two; two tests kill the others, each checked against its
mutant by hand: a save held at a closed exit reads back held, and a replayed entry whose world moved only after its
last sync point before the end reaches its last recorded tick. `core`: 435/438, 3 survivors explained, 0 not. And
main's `coverage` ratchet refused `world.ts`'s branch floor, 85 for 88 measured: 86 now, two points under, as the
other routes floors.

→ next: `vite.config.ts` is a mutation input, so this changes every set's cache key once; the coverage floors could
live in a file of their own.
