### Fixed

- **The daily backup ran nothing (4.2.3, found by the reference deployment)**: with the configuration in
  `STUDIO_CONFIG_JSON` (no `--config`), the Studio Server's commands dropped their first argument, so `import <dir>`,
  `invite --email …` and the daily `backup --to-bucket` of `ops/studio/backup-cron.sh` failed (`a new file is
  required`). Each now reads its arguments whole.
- **An operation another process confirmed is shipped (4.2.3)**: what the CLI wrote against the same database (an
  import, an invitation, a migration) emitted no event in the running instance, so it reached the bucket only at the
  next write there or a restart, and the RPO grew meanwhile. The instance now also ships every 30 s.
