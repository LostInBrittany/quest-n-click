### Changes

- **A hosted Studio never runs the game's code itself** (4.2.1, ADR 0028).
  - **With OIDC**, validation and the loads behind the Studio's reads run in `studio-worker`, a separate application
    with no secret of the platform. Configure `worker: { url, instance }` and the secret `STUDIO_WORKER_KEY`; create
    the keys with `studio-server worker-keys --out <folder>`. The worker needs `WORKER_PUBLIC_KEY` and
    `WORKER_INSTANCE`.
  - **Captures** are unavailable on a hosted Studio for now.
  - **Without OIDC** (the local server, on the loopback), nothing changes.
  - A game that imports files outside its own folder cannot run on a hosted Studio.
