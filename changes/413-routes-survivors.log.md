## the `routes` mutation set gated: its 53 survivors read, 49 killed, 4 named

#413: the 4.6.0 nightly measured `routes` at 226/279 (inputs 71164b654bf543d0), 36 survivors in `route-runtime.ts`
and 17 in `world.ts`. Each was applied by hand against the set's tests, before and after the test meant to kill it.

`world.ts`, 15 killed by `tests/world-mutants.test.ts`: every other route test imports `tools/replay`, which loads
`route-runtime.ts` statically and sets `World.Engine` for its whole file, so "the routes' engine not loaded" was never
reached. The new file imports the engine afresh in each test (`vi.resetModules`): a game without routes never loads
it, ticks nothing, drains nothing and asks it nothing (`advanceTo`, `drain`, `nextPending`); a game with routes asks
nothing of it before its first room, loads it once, and runs the clock forward only; a sync point outside any entry
records nothing.

`route-runtime.ts`, 34 killed by `tests/route-runtime-mutants.test.ts`. Many guards are for content `validate`
refuses (an actor in every room a route walks), but a save, a `moveActor` or a layout not placed yet still reach them,
as the file's earlier tests already pinned for a missing point: a character with no actor in a room waits, walks and
leaves unseen (nothing written, nothing told, its exit taken at once), crosses into a room with no actor or no entry,
or has no position at all. And the boundaries: a walker on its point or exactly half a unit from it does not move, the
last step of a tick that reaches the foot of a ladder climbs it in that tick, a wait of exactly one tick is done in it,
"until the next stop" runs ten minutes of the clock at most, an unreachable point with no closed link is not
`blocked`. The test "a step past the last one wraps" did nothing: `scriptState` puts `pc` back from the saved step id,
so it now drops the id too (a save whose `pc` is the steps' count, which load keeps). Three mutants are killed by an id
written `undefined` (an actor, a state key, an exit): where a missing id would fall, never found.

Named, 4, each `equivalent`: `world.ts`'s second `w.length - 1` (a sync point past the last recorded one: the clock
already stands there and never goes back within an entry) and `t !== undefined` (`advanceTo(undefined)` does
nothing); `route-runtime.ts`'s `dx < 0` under `if (dx)`, and the topology cache, whose rebuild gives the same floor
(only the dev editor replaces a layout while an engine runs, and keeps the routes' old floor until a reload).

`routes`: 275/279, 4 survivors explained, 0 not. It joins `GATED`; `MEASURED` is empty again. No production code
changed.

→ next: the dev editor's layout replaced while routes run keeps their cached floor until a reload; a cache keyed by
the layout object would follow it.
