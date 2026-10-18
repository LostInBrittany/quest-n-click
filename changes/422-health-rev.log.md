## 4.2.2 PR 3a: diagnostics with their revision, and on the worker

- **The revision of a read** (G3): `http.ts` reads the journal's revision under the same read lock as the answer and
  sends it as `x-studio-revision`; the client keeps it beside the answer (`revisionOf`, `api.ts`); the Check tab says
  "revision N" (or a range when its requests straddled a write) and "stale" once the live head is past it.
- **The diagnostics on the worker**: new job kinds `lint`, `solve`, `playtests`; one implementation
  (`studio-server/src/ops/diagnose.ts`) for the local Studio and the worker's child; the child checks the solver's
  parameters (`solveParams`) and says a refusal (an unknown checkpoint) as the local route does; the snapshot takes the
  playtests' sessions for that job only; only validate and load answers are cached by snapshot (a diagnostic depends
  on its parameters). Hosted, the solver has a 45 s limit (`HOSTED_SOLVE_MS`), under the job's deadline.
- **Stale, decided by the oldest result** (`src/studio/check-stamp.ts`): a write between the tab's eight requests
  leaves some at the older revision; a run that stops part-way shows none of the previous run's results. Rooms saves
  re-run the checks; a member's other own writes (storyboard, notes, forms) do not, and the label says so (re-running on
  each would queue the worker, one job at a time).
- **Second reading** (a subagent): any checkpoint name reaches the worker (only looked up) and an unknown one is a 400
  as on a local Studio; a diagnostic past its deadline is a 504 "unknown for now"; lint's solver has the 45 s limit
  too, and both stay 10 s under the job's deadline; the Studio checks each diagnostic's shape; a reality policy is
  refused on a hosted Studio (501) rather than solved as another question; the playtests test sends a real session.
  Left for PR 3b: a diagnostic holds the instance's read lock while the worker runs it (writes wait), as it did in
  the process before.
- **Tests**: `tests/studio-worker.test.ts` (lint and solve through the worker equal a local run; parameters bounded;
  an unknown checkpoint a 400; a session sent with the playtests job only), `tests/check-stamp.test.ts` (stale by the
  oldest result), `tests/studio-client.test.ts` (a read's revision), `scripts/e2e-studio-hosted.ts` (the Check tab's
  revision).

→ next: Claude (PR 3b: health per revision and bisection)
