### Fixed

- **The candidate's `connector-archive-e2e` follows #459 and #460 (next)**: its fake IMAP server answers `CAPABILITY`
  with UIDPLUS and `UID EXPUNGE`, and its search reads `KEYWORD` and `UNDELETED`, as the email connector now asks
  (it no longer sends a bare `EXPUNGE`, which the fake server now refuses); and the Bridge it starts raises
  `limits.pairingsPerAddress`, since every player of the script is paired from `127.0.0.1` (seven, over the default 5).
  4.7.2's first candidate failed on it: the script runs only in the candidate, on the packed archives.
