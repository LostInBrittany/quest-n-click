## 4.2.2 PR 3a: diagnostics with their revision, and on the worker

- **The revision of a read** (G3): `http.ts` reads the journal's revision under the same read lock as the answer and
  sends it as `x-studio-revision`; the client keeps it beside the answer (`revisionOf`, `api.ts`); the Check tab says
  "revision N" (or a range when its requests straddled a write) and "stale" once the live head is past it.
- **The diagnostics on the worker**: new job kinds `lint`, `solve`, `playtests`; one implementation
  (`studio-server/src/ops/diagnose.ts`) for the local Studio and the worker's child; the child checks the solver's
  parameters (`solveParams`) and says a refusal (an unknown checkpoint) as the local route does; the snapshot takes the
  playtests' sessions for that job only; only validate and load answers are cached by snapshot (a diagnostic depends
  on its parameters). Hosted, the solver has a 45 s limit (`HOSTED_SOLVE_MS`), under the job's deadline.
- **Seen in the e2e**: the Check tab's results made at revision 1 are marked stale once the editor's saves moved the
  head to 2 (a member's own writes do not re-run the checks; the label now says so instead of hiding it).
- **Tests**: `tests/studio-worker.test.ts` (lint and solve through the worker equal a local run; parameters checked;
  a refusal said; playtests' sessions sent with that job), `tests/studio-client.test.ts` (a read's revision),
  `scripts/e2e-studio-hosted.ts` (the Check tab's revision).

→ next: Claude (PR 3b: health per revision and bisection)
