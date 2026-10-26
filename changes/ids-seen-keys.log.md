## `npm run ids -- --write` rewrites the positional `seen` keys

#359, follow-up of #248 / #358. The renames come from two sources: the save migration's `map.seen` (what this run
names) and `movedSeenKeys` in `src/engine/tools/validate/seen.ts`, the validator's own "old place → key" pairs, so a
game that got its ids from an earlier `ids` run (before this fix) is caught as well, and the key the tool writes is
the one the validator would have named. `tools/ids/seen-keys.ts` reads the source with the TypeScript parser and
touches only the value of a `seen: '…'` property and the keys of a `seen: { … }` object; a string keeps its quotes, an
identifier key becomes a string in the file's quotes. The renames run before the id codemod, so the dry run's line
numbers are those of the file as it is. `planIds` returns them per file (`seen`); `tools/ids.ts` and the Studio's
`migrate` write a file that has renames even when it gets no id. On the repository's games (`demo`, `heroes`,
`reference`, `signals`, `_template`) the dry run renames nothing: none uses a positional key. `tests/ids-seen-keys.test.ts`
(5 of its 6 cases failed before the fix): topic, listener and choice keys in conditions and in a checkpoint, a topic
that already had an id, the dry run's list and lines, quotes kept, texts, flags and unknown keys untouched, a second
run that changes nothing.

→ next: nothing planned.
