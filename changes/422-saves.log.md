## 4.2.2 PR 2b: ADR 0026, saves across revisions

- **The decision** (`docs/dev/adr/0026-saves-across-revisions.md`): the envelope unchanged (D40); a slot's
  `SlotMeta.revision` and the autosave's record in the page's storage say where a save was made (revision and full
  fingerprint); only a build that declares its revision (`BootOptions.revision`, a preview from its base) writes them
  and asks; the test is the content, not the number; Resume here, Restart, Stay in revision N; the texts are the
  Studio's, outside the game's `ui`.
- **The code**: `src/engine/dom/revision.ts` (the guard, its record of the autosave around the engine's own store, the
  dialog), `boot.ts` (the guard when the build declares a revision), `menus.ts` (Continue and a slot's load ask
  first), `save.ts` (a slot's record read back when well formed), `src/main.ts` (a preview's revision from its base).
- **Tests**: `tests/revision.test.ts`; `scripts/e2e-studio-hosted.ts` loads the latest preview in the Play tab, checks
  the revision recorded, the question and its answers, and that Stay opens the save's revision (G2).
- **Not done here**: the Play tab (`?dev`) starts a new game, so in the Studio the question comes from a slot; a
  revision no longer kept cannot be stayed in (said in the ADR).

→ next: Claude (PR 3: health per revision and bisection)
