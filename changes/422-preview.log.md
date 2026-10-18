## 4.2.2 PR 2a: per-revision previews, built by the worker; Vite out of the Studio Server

- **The build** (`studio-server/src/worker/preview-build.ts`): `vite build` of the revision's snapshot in the worker's
  child (an emptied environment, its process group, a deadline), base `/preview/<rev>/`, no public files, no service
  worker, the Studio's origin in a meta tag, the fingerprint's `site.json`, the editing tools on
  (`VITE_STUDIO_PREVIEW`). The result is bounded (2,000 files, plain relative paths, base64) by the worker and checked
  again by the Studio. In the tests and the e2e stack the same child runs on this machine (`worker/local.ts`).
- **The store** (`server/previews.ts`, migration 0006): coalesced builds, one at a time, from a snapshot packed holding
  the instance's lock (the label is the revision it was made from); files in the blob store by content; one row per
  revision and epoch, ready or failed with its reason, never built twice (a restart included). Its state goes to the
  live events (`preview`, and in `hello`).
- **The game's origin**: `/` redirects to the last ready preview (its query kept), or says it is being prepared;
  `/preview/<rev>/…` serves the build (its hashed code immutable, its page revalidated, so an ended session is refused
  at the next load: the e2e caught a page served from the cache after the logout) and the prepared assets by an
  allow-list, one byte range when asked; anything else is a 404.
- **The Studio's page**: the room view reloads on a newer preview unless a placement is unsaved; the label says the
  revision shown, the one building, a failure; Vite-era reload timers are off when hosted.
- **Second reading** (a subagent): a worker away or a timeout is no longer recorded as the revision's failure (only
  the game's own build failing is; the rest is tried again, 5 s doubling to 5 min); the folder is repaired to the head
  before it is packed; the assets' streams end on an error or a client gone; a build never stays shown as running;
  the assets' version is computed once; a new history reloads the frames; hidden files are refused; the Play tab says
  it keeps its preview and offers the latest; the job binds the snapshot's revision; an output over 16 MiB says so.
  Left as limits, written in STUDIO-SERVER: text files only in a preview, one worker queue shared with validations,
  few files shared between revisions (the base is in the page and its code).
- **Measured here**: the sample game's preview builds from its snapshot in a child in about half a second on the
  maintainer's machine (cache empty): about 50 files, 1 MB.
- **Departure from the plan's PR order**: ADR 0026 (saves across revisions) is its own PR, 2b, next; the plan put it in
  PR 2. Until then, a save made in a preview is not told apart by revision (STUDIO-SERVER "Known limits").
- **Tests**: `tests/studio-previews.test.ts` (coalescing, once per epoch, failures, another epoch, the files' bounds),
  `tests/studio-client.test.ts` (a real build served and what is refused), `tests/studio-worker.test.ts` (the job
  through the worker, never cached, its parameters checked), both browser e2e (the editor on `/preview/<n>/`, a layout
  written meanwhile shown once built, the logout refusing the next load).

→ next: Claude (PR 2b: ADR 0026, then PR 3, health per revision)
