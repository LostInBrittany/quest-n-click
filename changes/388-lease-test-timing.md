### Fixed

- **The lease renewal tests no longer depend on how fast the runner is (4.5.6, #388)**: main's `ci` went red on
  Windows only, in `tests/studio-engine-upgrade.test.ts`: a run of 30 ms with a renewal every 5 ms was expected to
  log two failed renewals, and Windows' coarse timers (about 15 ms a tick) fit only one. The operation under the lease
  now lasts until the second renewal has been logged (and, without a log, until the first renewal has run), and the
  owner's lease test waits for its two renewals the same way, so each proves what it did with no elapsed time to
  guess. Tests only; the Studio's lease is unchanged.
