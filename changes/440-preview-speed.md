### Changes

- **A hosted preview's time, phase by phase (4.4.0)**: a preview's log line (`"event":"preview"`) now says where its
  time goes: `queuedMs` (from the write to the build's start: the coalescing, a build before it, the retries),
  `snapMs`, `jobMs` (the worker's job as the Studio waits for it, its queue on the worker included), `storeMs` and the
  whole wait, `sinceWriteMs`. Each job the Studio asks of the worker logs a `worker-call` line (`putMs`, `postMs`,
  `getMs`, `delMs`), and the worker's own `worker-job` line says `queueMs`, `fetchMs`, `unpackMs`, `childMs` and
  `putMs`. Two histograms read them, `studio_preview_phase_seconds{phase}` and
  `studio_worker_job_phase_seconds{kind,phase}`; `studio_preview_build_seconds` is said to start after the snapshot,
  as it always did.
