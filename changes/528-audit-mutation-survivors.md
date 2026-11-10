### Fixed

- **The mutation gate is green again after the audit fixes (next, #528)**: eleven survivors in code merged by #480,
  #498, #503 and #504, in no test and in no entry of `docs/dev/mutants.json`, stopped four sets (`core`, `reality`,
  `reality-store`, `connectors-edge`) in the candidate of #527. Each is now killed by a test: a migration gives
  another player no `used` key it did not have; the groups after `::` land in their place in the connectors' IPv6
  /64 key, and an address a socket never gives keys by its text; a journal write cut short writes the rest from
  where it stopped; and the streams' per-player index test now judges the `reality-store` set.
