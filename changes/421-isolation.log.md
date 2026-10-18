## 4.2.1 PR I: the game's code runs in a worker without secrets

Branch: feature/421-isolation (stacked on PR 5) · Plan §3.8, ADR 0028

- **`studio-server/src/worker/`:**
  - `job.ts`: Ed25519 jobs, binding id, instance, epoch, revision, snapshot hash, kind, parameters, staging prefix,
    expiry and presigned URLs;
  - `snapshot.ts`: sources and data only, unpacked without leaving the folder;
  - `child.ts`: validate or load, with an emptied environment;
  - `main.ts`: the supervisor (single use, one instance, process group killed at the deadline, survivors → recycle,
    bounded output) and the `studio-worker` entry point.
- **`studio-server/src/server/remote-executor.ts`:** the Studio's side. Snapshot up, signed job, result read back and
  checked, staging deleted, last answer kept by snapshot hash.
- **`studio-server/src/ops/validate-dir.ts`:** the validator's verdict on a folder, one function for the Studio and the
  worker. `core.ts` takes an `executor` (validate and load); captures are unavailable with one.
- **Configuration:** with `oidc`, `worker` and S3 blobs are required; `STUDIO_WORKER_KEY`; `studio-server
  worker-keys`. `S3.delete`.
- **Measured:** child 237–283 ms; Mac → Cellar round trip 760–958 ms; spike S Studio → worker inside Clever p95 37 ms.
  The p95 on Clever is measured with the hosted pass.
- **Tests:** `tests/studio-worker.test.ts`, 13 cases:
  - signatures, expiry, prefix, kinds;
  - snapshot contents and paths;
  - emptied environment and the deadline with grandchildren;
  - refusals: signature, instance, replay;
  - another job's answer refused;
  - the full round trip through a memory S3 (validate, load, cache, deadline, no staging left);
  - the Studio reading through the executor;
  - with STUDIO_TEST_S3: a presigned write scoped to its key, and the round trip through Cellar.

→ next: Claude (PR 6, leases and live events)
