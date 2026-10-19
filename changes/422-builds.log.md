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
- **Second reading** (a subagent): the manifest says what built it as the worker knows it (`build.json`: its engine,
  its commit when it is a Git checkout, its lockfile's sha256), the assets' version it was built against (a rebuild
  uses the same), and the revision's verdict, the revision being judged at publication (`Health.judgeSnapshot`: the
  coalesced loop may pass it over); the bytes signed are an explicit canonical form (keys sorted, files as pairs sorted
  by UTF-8 bytes), prefixed `web-scumm build manifest v1\n` (no overlap with a job token's bytes, by design now), kept
  and given back as `signed`, with the key's id in the manifest; a build's number is reserved first (two instances
  during a deploy never share one) and a failed build leaves no row; one build at a time, a second asked meanwhile is
  a 429; the last green build in one query; a rebuild in another history is said as such; the public paths' predicate
  is the one tested; a reviewer sees no Publish button. G6, as built: no diagnostics beyond the verdict (validator and
  solver), and the images and sounds are served from the instance as they are now, outside the build.
- **Tests**: `tests/studio-builds.test.ts` (numbered, signed, the signature broken by a changed file or revision; the
  last green build as judged now; served by number, the page revalidated, the code immutable; refused paths; a fresh
  rebuild the same, then different; a snapshot the journal does not give back the same), `tests/studio-play.test.ts`
  (a public build without a session, nothing else; the predicate itself in `studio-builds.test.ts`), `tests/studio-worker.test.ts` (a real published build through the
  worker), `scripts/e2e-studio-hosted.ts` (publish from the Play tab, the signature checked, `/play/1/` served).

→ next: Claude (PR 6: the assets' qualification on the native runtime)
