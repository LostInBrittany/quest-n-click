## 4.2.2 PR 5: published builds `/play/<n>`

- **The build** (`studio-server/src/server/builds.ts`, migration 0009): the head's snapshot, packed holding the
  instance's lock, built by the worker as a preview is (`preview-build.ts` with `play`: base `/play/<n>/`, the
  player's game: no editing tools, no Studio origin); its files kept by content; its manifest (epoch, revision,
  engine, the snapshot's sha256, each file's sha256, the revision's health then) signed with Ed25519 by the Studio's
  job key (`STUDIO_WORKER_KEY`; the worker's public key checks it; `manifestBytes` is the canonical form). One
  publication or rebuild at a time.
- **Served** on the game's origin: `/play/<n>/` from the manifest (the page asked again at each load, the code kept),
  the prepared assets beside it; `/play/` sends to the last green build, computed when asked from `studio_health`
  (a build published before its revision was judged becomes green once it is). `publicBuilds` (config, false by
  default, D42) opens `/play/` and `/icons/` without a game session, still framed by the Studio only.
- **Fresh rebuild** (an owner, D42: an option, not required to publish): the same revision's snapshot rebuilt from
  the journal (refused, 409, if it is not the published snapshot), built again, compared file by file; the comparison
  is kept with the build, which never changes. It runs on the worker as it is now: a redeployed worker is not asked
  for (its cost is measured by the `studio-preview` pass).
- **API**: `GET /api/builds`, `GET /api/builds/<n>` (manifest and signature), `POST /api/builds` (a dev),
  `POST /api/builds/<n>/rebuild` (an owner). The Play tab's panel publishes, lists (green, failing, not judged),
  opens and rebuilds.
- **Limits, written in STUDIO-SERVER**: no service worker in a published build; its saves not yet told apart by build.
- **Tests**: `tests/studio-builds.test.ts` (numbered, signed, the signature broken by a changed file or revision; the
  last green build as judged now; served by number, the page revalidated, the code immutable; refused paths; a fresh
  rebuild the same, then different; a snapshot the journal does not give back the same), `tests/studio-play.test.ts`
  (a public build without a session, nothing else), `tests/studio-worker.test.ts` (a real published build through the
  worker), `scripts/e2e-studio-hosted.ts` (publish from the Play tab, the signature checked, `/play/1/` served).

→ next: Claude (PR 6: the assets' qualification on the native runtime)
