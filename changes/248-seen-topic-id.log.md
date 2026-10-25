## the validator checks `seen` keys

`check()` in `core/cond.ts` reads `s.seen[key]` as written, and nothing checked the key: a schema 3 topic is recorded
as `topic.<id>` (`core/keys.ts`), so the positional `<room>.<actor>.<i>` was never true. The engine is unchanged (the
id is the point of schema 3; matching the old place too would bring back the shift on insert). New
`tools/validate/seen.ts`: the keys the game records (topics, `once` listeners of rooms and game, Reality signals
with `once` not false, and the `once` choice options the command walk meets, those without an id at game level in
any room), the old place → key of each that has an id, and a tracker the validator feeds from `cond` and the
checkpoints' `seen`, checked last (after the objectives' conditions). The checkpoint checks moved to
`tools/validate/checkpoints.ts` so `validate.ts` stays under its file-size cap (1071 lines, cap 1081 left as is).
Saves are untouched: no key changes, the golden saves load as before. `tests/seen-key.test.ts`: every recorded kind
accepted, the moved topic, listener and option named, typos and non-`once` refused, Reality `once: false` refused,
a game-level option in any room, a checkpoint, and the engine records the key the validator accepts. The wiki's
LIMIT `seen-key-v3` (`create.conditions`, en and fr) became prose; the `#seen` pair acked as the author's.

→ next: `npm run ids -- --write` could rewrite positional `seen` keys in the sources when it gives the ids.
