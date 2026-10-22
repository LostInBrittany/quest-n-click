## 4.4.0: the hosted preview, measured phase by phase, then made faster

- **Why**: on the reference deployment (QUALIF-4.2.3 §6) a hosted preview takes p50 34 s, p95 44 s from a write to
  ready, while the worker's own `preview` job takes about 6 s. A reading of the code gave suspects (the worker's one
  job at a time behind the health's `validate` and `solve`, the files stored one after another, the staging deletes
  awaited, a snapshot packed three times per revision) but no measure said which.
- **Instrumentation, no behaviour change**: the `preview` line's phases (`queuedMs`, `snapMs`, `jobMs`, `storeMs`,
  `sinceWriteMs`); a `worker-call` line per job on the Studio's side (`putMs`, `postMs`, `getMs`, `delMs`); the
  worker's `worker-job` line (`queueMs`, `fetchMs`, `unpackMs`, `childMs`, `putMs`); two histograms. The help of
  `studio_preview_build_seconds` said it included the snapshot: it never did.
- **Optimizations** (a second commit, to measure against the first):
  - the worker's lanes (`worker/lanes.ts`): `preview` and `other`, one child each at most, 8 jobs held per lane; ADR
    0028 says what two children at once change (nothing past the trust domain it already assumed);
  - one snapshot per revision (`server/snapshot-memo.ts`), given again while the head (epoch, revision, read without
    the lock) has not moved, forgotten at each `confirmed`; a failed pack is not kept;
  - a build's files stored 8 at a time (`storeFiles`); the S3 blob store skips the PUT of a blob it wrote itself less
    than an hour ago (the collection's grace is a day; the key is the content's hash); a HEAD was not enough: an old
    blob's date must be refreshed, or the collection may take it before its row lands;
  - the remote executor no longer awaits the staging deletes (`settled()` for the tests);
  - not done: a persistent Vite `cacheDir` per worker. `vite build` does not use it (it holds the dev server's
    prebundled dependencies), and a folder the game's code writes in must not outlive its job (ADR 0028).
- **Tests**: tests/studio-worker-lanes, tests/studio-snapshot-memo, tests/studio-s3-blobs (new); the previews' phases
  and `storeFiles` in tests/studio-workshop-previews-mutants; the phases and the staging in
  tests/studio-remote-executor; the worker's line and a preview run beside a load in tests/studio-worker; the
  histograms in tests/studio-metrics.
→ next: measure both commits on the reference deployment (write → ready p50/p95, by phase) and write the numbers in
QUALIF-4.2.3 §6; then the passes.
