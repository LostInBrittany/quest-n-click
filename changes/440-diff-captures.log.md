## 4.4.0: before/after captures in the semantic diff

- An outside review asked for them ("voir immédiatement une régression de placement, de police ou de débordement"),
  and 4.2.3 left them open (D45). `tools/studio/diff-rooms.ts` (pure) says which rooms: `layout/<id>.json`, a room's
  source (every room a shared file defines, by the head's room files), `rooms/<id>.ts` for a room added or removed,
  a locale's `room:<id>/…` keys; other drawn files (`cast.ts`, `site.json`, a locale's other keys) alone give the
  first room as a sample; authoring files, tests, `private/`, `art/`, `audio/` are not drawn; cut at 6.
- `studio-server/src/ops/diff-captures.ts`: a revision is the folder on disk with every journal operation after it
  undone from its "before" blob (`snapshotAt`, packed as the worker's snapshot), built by `localPreview` (the
  worker's child, `vite build` of preview-build.ts: the game's code never runs in the Studio's process), and served
  to one headless Chromium from memory through `context.route` (no server, no port): the build's files, else
  `public/` and the prepared assets, the same for both sides. 960 × 600, one device pixel, reduced motion, CSS
  animations and transitions off, `document.fonts.ready`, images decoded, the editor's overlays hidden (as the
  existing screenshot). The two captures are compared in that browser: `box` where any channel is off by more than
  16, `same` when nowhere. Exact bytes were not enough: two renders of one page differed by 2 on an anti-aliased
  corner of the inventory. Measured on the demo: the whole route (two builds, four captures) in about 5 s.
- `core.diffCaptures` (unavailable with an `executor`: hosted), `GET diff/<from>..<to>/captures` (501 with the
  reason), the panel's button and view (`src/studio/diff-captures-view.ts`), PNGs as data URLs (both servers answer
  them; no file route needed) and as files under `.cache/studio/<game>-diff-<from>-<to>/`.
- Limits, said in STUDIO "Check": local only; default language; the room as entered, not at a chosen checkpoint;
  today's prepared images, sounds and fonts on both sides; a hand edit the journal did not record is on both sides.
- Tests: `tests/studio-diff-rooms.test.ts` (which rooms), `tests/studio-diff-captures.test.ts` (the demo over a
  journal: a revision put back; the garden's tank moved 200 px gives two different PNGs and a box in the scene; a
  market look line gives `same`; hosted unavailable; real builds and Chromium), `tests/dom/studio-diff-panel.test.ts`
  (the captures asked on demand, the box in percents, a missing side, the hosted refusal). CI: the unit jobs do not
  install Chromium, so the drawing test is skipped there; `studio-hosted` (which does) runs it with
  `STUDIO_TEST_CAPTURES=1`, required; Windows excludes it like the worker's tests; `tools/ci-plan.ts` gates the test
  and `diff-rooms.ts` on `studioHosted`.
→ next: the captures on a hosted Studio (Chromium qualified on the worker, or drawn from the revisions' previews in
the reviewer's browser), and a checkpoint or a language to draw at.
