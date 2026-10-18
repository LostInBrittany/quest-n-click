## 4.2.2 PR 3b: health per revision, and the bisection

- **The verdict** (`studio-server/src/server/health.ts`, migration 0007): after each confirmed revision, coalesced, the
  head is judged on the worker from a snapshot packed holding the instance's lock: the validator, then the solver from
  a new game, a witness bounded to 45 s (`judgeBy`). The guard already refuses an edit the validator fails, so what a
  revision breaks is mostly a game that can no longer be finished. One row per revision and epoch; a restart judges
  nothing twice; a worker away records nothing and is tried again (5 s doubling to 5 min); a solver cut short records
  nothing and says "unknown".
- **The bisection** (G4): when the head fails and the last judged revision passed, the revisions between them are
  judged on snapshots rebuilt from the journal (`Journal.filesAt`: the head with the later operations undone, from
  their "before" blobs, sources and data only, `packable`) until the first failing one, in ⌈log₂ n⌉ checks at most,
  each kept. It names the revision, its operation's `what` and its files (`Journal.opAt`), never its author. A failing
  head after a failing revision keeps the revision found; an unknown verdict on the way stops the search, naming none.
  `POST /api/health/bisect {good, bad}` (a dev) checks its ends first.
- **Shown**: the live events carry the state (`health`, and in `hello`); the header's chip says "✔ valid at revision
  N", "✖ k error(s) at revision N · broken since revision M: what (files)", "checking…", or "unknown", stale once the
  head has moved past it. The game's title in the header no longer shrinks to nothing beside it (the e2e caught it).
- **Tests**: `tests/studio-health.test.ts` (once per revision; ⌈log₂ n⌉ for several n and k; kept while broken, read
  back after a restart; unknown; another epoch; a worker away; a bisection asked for and its ends; the verdict's
  composition; a past revision's files and their snapshot, equal to the folder's; the chip's texts),
  `scripts/e2e-studio-hosted.ts` (the chip in a real hosted Studio).

→ next: Claude (PR 4: personal undo and redo)
