## 4.4.0: the hosted preview, measured phase by phase

- **Why**: on the reference deployment (QUALIF-4.2.3 §6) a hosted preview takes p50 34 s, p95 44 s from a write to
  ready, while the worker's own `preview` job takes about 6 s. A reading of the code gave suspects (the worker's one
  job at a time behind the health's `validate` and `solve`, the files stored one after another, the staging deletes
  awaited, a snapshot packed three times per revision) but no measure said which.
- **Instrumentation, no behaviour change**: the `preview` line's phases (`queuedMs`, `snapMs`, `jobMs`, `storeMs`,
  `sinceWriteMs`); a `worker-call` line per job on the Studio's side (`putMs`, `postMs`, `getMs`, `delMs`); the
  worker's `worker-job` line (`queueMs`, `fetchMs`, `unpackMs`, `childMs`, `putMs`); two histograms. The help of
  `studio_preview_build_seconds` said it included the snapshot: it never did.
→ next: deploy this commit alone to the reference deployment for a baseline, then the optimizations.
