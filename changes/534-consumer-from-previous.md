### Changes

- **The candidate moves a game from the previous release to its own archives (next, #534)**: `external-consumer` on
  Ubuntu Node 22 (Postgres), macOS and Windows now creates its game on the newest release older than the candidate
  (`--from=previous`, resolved at run time and checked against that release's sums), where it used 4.1.17, 4.1.16 and
  the pre-release 4.1.18-rc.1 since 4.1.19; Ubuntu Node 24 keeps 4.1.17 as the long path. `upgrade-check` and
  `external-consumer` share one resolver (`previousRelease` in `scripts/upgrade-source.mjs`).
