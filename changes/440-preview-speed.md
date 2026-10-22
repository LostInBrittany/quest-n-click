### Changes

- **A hosted preview's time, phase by phase (4.4.0)**: a preview's log line (`"event":"preview"`) now says where its
  time goes: `queuedMs` (from the write to the build's start: the coalescing, a build before it, the retries),
  `snapMs`, `jobMs` (the worker's job as the Studio waits for it, its queue on the worker included), `storeMs` and the
  whole wait, `sinceWriteMs`. Each job the Studio asks of the worker logs a `worker-call` line (`putMs`, `postMs`,
  `getMs`, `delMs`), and the worker's own `worker-job` line says `queueMs`, `fetchMs`, `unpackMs`, `childMs` and
  `putMs`. Two histograms read them, `studio_preview_phase_seconds{phase}` and
  `studio_worker_job_phase_seconds{kind,phase}`; `studio_preview_build_seconds` is said to start after the snapshot,
  as it always did.
- **A faster hosted preview (4.4.0)**: the worker runs one job at a time per lane, a preview's build in a lane of its
  own, so it no longer waits behind the health's validator and solver (up to 45 s) or a load; each lane holds 8 jobs
  at most. The Studio packs one snapshot per revision, shared by the preview, the health, the published builds and the
  engine's upgrade (the lock, the repair and the walk once, not three times); stores a build's files 8 at a time; does
  not write again a blob it stored less than an hour ago; and answers once it has read the worker's result, the
  staging deleted after (a delete that fails is logged, `worker-staging-left`). Nothing changes for a game.
