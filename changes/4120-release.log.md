## 4.1.20 PR 6 (draft): the technical candidate's thresholds, written before its dispatch

Written on 2026-10-14T22:48Z, before `gh workflow run candidate -f sha=d955785b2b4652e1473fc98ffd9357b2f284e2ec` (main after #122), so the
candidate is judged against criteria older than it (plan §8.3; the critique of 14 Oct, C6 and C9b).

- **Time.** The budget of plan §7.5 is the **critical path** through `needs` (`baseline.mjs`,
  `duration.criticalPath.seconds`): 90 min at most. Over it, a larger budget is decided and written here before the
  final candidate runs (§7.5). The **wall time** (`duration.wallSeconds`, first job's start to last job's end) has an
  **alert threshold** of 150 min: over it, the cause (queueing, a slow runner) is said here and in
  `baselines/4.1.20.md`; it blocks nothing.
- **Load.** The gate is the absolute budgets, unchanged: 0 gaps; proposals p95 under 1 s on SQLite and Postgres;
  leaderboard p95 under 2 s and RSS under 512 MB on both. `load.json` is reseeded from this candidate's three-load
  medians only if each is within 25 % of 4.1.19's (SQLite proposals 387.2 ms, leaderboard 464.4 ms; Postgres
  proposals 507.4 ms, leaderboard 205.6 ms). Beyond 25 %, a reseed needs a justification written here first: the
  cause named (a code change, or a runner shown slow by its other jobs' durations), a corroborating measure (another
  run, or a local load on the same protocol), or the maintainer's explicit acceptance. The 4.1.19 values stay in
  `load.json` beside the new ones.
- **Reruns.** One rerun of a red job is allowed; it does not by itself prove a flake. Each is written here with its
  cause, both attempts' results, `run_id` and `run_attempt` from the Actions API, and the sums of the artefacts
  finally verified. A second red of the same job is a NO-GO.
- **What only this candidate proves** (C5): the full `ops:qualify` profile (dispatch only; pull requests run
  `--short`) on the archives and image of a `main` SHA, and the signing rehearsal on `main`. `preflight-stable` is
  run by hand afterwards; acceptable gaps then: every npm row, and the signing key on GitHub until the maintainer adds
  it.

→ next: the technical candidate on d955785b2b4652e1473fc98ffd9357b2f284e2ec, then this branch's release files.
