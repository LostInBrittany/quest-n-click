## 4.5.0: the placement editor's mirrors (#252)

- `dev/editor.ts`: the Selection folder was read-only, so the layout's `flip` (a prop or an actor) and `flipV` (a
  prop), read by `dom/room.ts`, could only be set from the phone placement page (`tools/pages/placement.ts`) or by
  hand in the JSON. Found turning an NPC toward the room in a game: the editor moves and sizes a character, but cannot
  turn it around.
- `dev/mirror.ts`: the checkboxes, rebuilt on each selection (from the overlay and from the Studio's bridge). A prop
  is edited in the state shown when that state's variant sets its own mirror, as its position is; otherwise the
  prop's own value. Off on an element's own entry removes the field, as the placement page does; off on a state's
  variant stays written, or the state would fall back to the prop's value. Turning an actor drops the facing a script
  left in the state (`face`, `place`), as a drag drops its remembered position. An actor whose room sets `facing`
  shows a note: that facing wins (`o.facing ?? a.facing ?? flip`, unchanged).
- `roundLayout` moved from `dev/editor.ts` to `dev/save-layout.ts` (what is written), so the editor stays under its
  size cap (`tests/file-size.test.ts`).
- `docs/` is frozen for the wiki (PLAN-4.5-WIKI §4.2): the two `TOOLS.md` sections changed, `wiki/coverage.json`
  refreshed (`npm run wiki -- coverage`) and both acknowledged (`--ack`); their destination,
  `studio.placement#placement-editor`, is planned and not written yet, so no wiki page to carry the text into.
- Checked in Chromium on the demo (`?edit=house`): Biscuit mirrored and back, Grandma's note (`facing: 'right'`), the
  chair's two checkboxes, none on a hotspot. Tests: `tests/editor-mirror.test.ts`.

→ next: review.
