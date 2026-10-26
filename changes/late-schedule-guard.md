### Fixed

- **A scheduled `nightly` or `prove` that starts more than two hours late runs nothing (4.5.6, #372)**: GitHub does
  not guarantee a schedule's start time, and on 2026-10-26 it started the nightly at 09:05 UTC and the weekly prove at
  09:44 UTC, nearly six hours late, where their jobs took the runners from a release's candidate and its pull
  requests. A first `guard` job (`tools/schedule-guard.ts`, a few seconds of Node) compares the start with the cron
  time; past two hours it says so in a notice and every other job is skipped, so the run stays green. A run by hand,
  the release's warm-up of the mutation cache among them, is never guarded.
