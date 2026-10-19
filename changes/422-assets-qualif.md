### Changes

- **The asset tools on the processing worker, qualified (4.2.2)**: their Python packages are locked with hashes for
  Clever Cloud's native runtime (`ops/studio/worker-requirements.lock`) and installed by the worker's build hook
  (STUDIO-SERVER gives the variable); measured on the spike's worker: 7 s to install, 4 s for a full `prepare` of the
  sample game (`docs/dev/QUALIF-4.2.2-ASSETS.md`).
