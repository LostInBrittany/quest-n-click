## 4.2.3: the job's lifetime allows the clocks' skew

- Found by the reference deployment (phase C, PR #190): from one restart on, `health-failed` and `preview-failed` with
  "the processing worker refused the job (403)"; 20 jobs signed on the studio's VM, 10 refused as expired.
  `remote-executor.ts` signs `exp = Date.now() + MAX_JOB_MS`; `worker/job.ts` refused `exp - now > MAX_JOB_MS`.
- `job.ts`: `CLOCK_SKEW_MS` (30 s) allowed beyond `MAX_JOB_MS`; the two refusals said apart ("has expired", "lives
  longer than a job may"). `worker/main.ts`: `worker-job-refused` logged with its reason. `remote-executor.ts`: the
  worker's reason in the error, 200 characters at most. Tests: `tests/studio-job-clock.test.ts` (to the millisecond on
  both bounds), `tests/studio-remote-executor.test.ts` (the reason, bounded).

- Second reading: the worker's error body read up to 4 KiB only (the worker is not trusted: ADR 0028), tested with an
  8 KB body; ADR 0028 and the threat model say the 30 s of skew. The reason reaches members' verdict text as plain text.

→ next: deployed on the reference deployment, then the release.
