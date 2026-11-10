### Changes

- **The weekly `prove` workflow is gone; the strict playtests run every night (next, #518)**: `prove.yml` was cancelled
  on its 60-minute timeout five Sundays of six, always in the bench, and had no report job, so nobody saw it; the one
  green run took 59 minutes and its bench was not even kept on a timeout. Its three steps: `prove:game` already runs
  on every push to `main` and in the candidate; `playtests -- --strict` now runs in the nightly's `worker-container`
  job (seconds), so a diverged session opens a `nightly-red` issue instead of waiting for a release; the bench stays a
  command run by hand (`npm run bench -- --rooms=100 --prove`), run by no workflow.
