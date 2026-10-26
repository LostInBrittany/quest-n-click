### Fixed

- **The scheduled `nightly` and `prove` run in the night, never in the working day (4.5.6, #372)**: GitHub starts
  their scheduled runs hours after their cron times, every time: from 6 to 26 October 2026 the nightly (03:17 UTC)
  started 4 h 36 min to 7 h 44 min late and the weekly prove (Monday 04:00 UTC) 5 h 37 min to 7 h 40 min late, in the
  working day, where their jobs took the runners from a release's candidate and its pull requests. Their crons now
  start the evening before (the nightly at 20:17 UTC, the prove on Sunday at 20:00 UTC), so those delays land them
  between 00:53 and 04:01 UTC. A first `guard` job (`tools/schedule-guard.ts`, a few seconds of Node) skips every
  other job of a scheduled run that still starts in the Paris working day (07:00 to 20:00 Paris time, summer or
  winter), and the run stays green. A run by hand, the release's warm-up of the mutation cache among them, is never
  guarded.
