### Fixed

- **A deploy no longer refuses writes for minutes (4.2.3, found by the reference deployment)**: on Clever Cloud the old
  instance lives on, renewing the service lease, for minutes after the new one is up, and was never seen to get
  SIGTERM, so writes got 503s for about 2.5 min at each deploy. The new instance now asks for the lease and the old one
  gives it back at its next renewal (10 s); an older instance never takes it from a newer one. A write that waited
  for another instance's journal lock is a 503 to retry, no longer a 409 a client could take as a conflict, and only
  the instance serving the writes repairs its folder every 30 s.
