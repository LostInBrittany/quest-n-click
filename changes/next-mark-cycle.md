### Fixed

- **`prepare` no longer stops at its "next mark" step (next)**: `npx tsx tools/next-mark.ts --write` waited on itself
  and exited 13 ("unsettled top-level await") with nothing written. Its CLI imports `tools/next-mark-records.ts`, which
  imported `rekey` and `textHashOf` back from it; they now live in `next-mark-records.ts`, so the import goes one way.
  The tests called the functions, never the command: a test now runs it with `--write` on a copy of the repository.
  The first `prepare` since #449 was the first to reach that step with the command.
