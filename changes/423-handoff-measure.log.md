## 4.2.3: the lease handoff measured on the reference deployment

- Three studio deploys at origin/main `dd66b38d` (#183) on the test org, with the PR 9b probe (`/readyz` every 1 s, a
  note every 3 s retried with the same `X-Studio-Op`, the instances every 5 s): from `c66fbf56` (no handover) the lease
  came 2 min 33 s after listening, writes 503 for 2 min 27 s, two 409s and a 500 from the old code; then two
  `clever restart`s of the same commit: `lease-lost` on the old instance and `lease-taken` 6.0 s and 10.1 s after
  listening, writes 503 for 16 s and 10 s (Clever routing to the old instance until the deploy ends), one write per
  restart waiting 10 to 20 s on the starting instance's journal check (now a 503), no 409 or 500, nothing applied twice.
- Found: the worker refuses jobs on a clock skew of a few milliseconds. `remote-executor.ts` sets `exp` to exactly
  `Date.now() + MAX_JOB_MS` and `worker/job.ts` refuses `exp - now > MAX_JOB_MS`; on the third deploy's VM, 10 of 20
  probe jobs (signed on the studio VM, an invalid `dest` so none could run) got 403 "the job has expired", and the
  health and previews failed intermittently. Not fixed here: a clock margin is needed, and the 403's reason is logged
  nowhere.
- Docs: QUALIF §2, §5 bis, §7, §8; STUDIO-SERVER (en, fr) deploy cost and `/readyz` alert. No code changed.

→ next: a clock margin for the job's expiry (and the 403's reason logged), then the reference deployment's worker on
the same commit.
