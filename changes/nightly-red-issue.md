### Changes

- **A red nightly opens an issue, and the next green one closes it (4.5.6, #379)**: a red nightly told nobody but the
  cross on the Actions page, and on 26 October 2026 one was found at the next release's candidate, a day late. The
  nightly's last job, `report` (`tools/nightly-report.ts`, Node alone), reads every job's result: a job that failed,
  timed out or was cancelled opens an issue labelled `nightly-red`, or comments on the open one (one issue per red
  streak), with the date, the commit, the run's link, the red jobs and, for a failed mutation gate, the surviving
  mutants `docs/dev/mutants.json` does not name. The first green night comments "Green again on <run>" and closes it.
  A warm-up of the mutation cache reports a red gate too but never closes the issue; a run the `guard` skipped in the
  working day reports nothing. Only that job may write issues; the rest of the workflow keeps its read-only token.
