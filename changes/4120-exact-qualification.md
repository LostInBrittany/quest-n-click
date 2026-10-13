### Changes

- **The candidate qualifies exactly what it publishes** (4.1.20): a candidate started by hand, the only one a tag may
  name, runs the Bridge's full qualification profile on its own four package archives and image, for its own run.
  Its gate refuses anything less: the short profile, another commit or run, a step missing or failed, other archives
  or another image (`tools/release/candidate.mjs qualification`). A pull request's run keeps `--short`.
- **The qualification plays both restore modes under the maintenance lease** (4.1.20): a restore is refused at once
  while the three Bridges serve, then `--mode=replace-store` runs with them stopped, after its safety backup, and every
  player's signals and the board are compared. Its report (`ops-qualify.json`, schema 2) says the profile, the
  commit, the candidate run, the four archives' SHA-256 and the command that reproduces it. Each step has a stable id,
  its duration and its first defect.
- **One manifest of a release's files** (4.1.20, `tools/release/artifacts.mjs`): for each file, the job that makes it,
  its place in the candidate's manifest, its published name and its SBOM. `release.yml` checks its folder against the
  manifest before uploading and makes nothing the candidate made. `ship verify` refuses a release whose files are not
  exactly the manifest's. It gives back the 4.1.19 release file for file.
- **The Bridge image says how it was made** (4.1.20): its identity (schema 2) adds the OS, the architecture, the
  Docker engine and BuildKit, the archive's compression and size.
- **Load figures are medians of three** (4.1.20): the candidate loads each store three times. The median of the three
  p95 is compared with a baseline of the same runner and protocol (`docs/dev/baselines/load.json`). It raises an
  alert past 25 %, and fails only past the absolute budget (proposals under 1 s, the leaderboard under 2 s) or when
  all three loads are that much slower.
- **What a large backup costs in memory is measured** (4.1.20, `tools/backup-memory.ts`, the candidate's
  `backup-memory` job): backups of 64, 128 and 256 MiB on SQLite and Postgres, measured against the qualification
  container's 512 MiB. It records the peak memory of the candidate Bridge's export, read and restore, and their
  durations, and checks that one byte and one row above the bounds are refused.
- **A release download that meets a 5xx is tried again** (4.1.20): `external-consumer` and `readme-quickstart`, as
  `ops:qualify` already did. The connectors' end-to-end check draws its SSH host key until ssh2 reads it back.
- The baseline refuses a qualification of another commit (4.1.19's pointed at one of `43dac1b`) and records the
  medians and the memory measures. The README says "the four package archives" and which files the candidate makes
  and which the release makes.
