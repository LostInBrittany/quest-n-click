### Fixes

- **A connector no longer crashes on an unexpected rejection** (4.1.20): the badge and email connectors' bookkeeping
  of requests in flight, the IMAP poll's timer and the `/health` handler each caught a rejection the request already
  answers. A `health()` that throws now answers 503. None of them can be reached under today's contracts.
- **A secret that is not a string is refused at start** (4.1.20): an inline `secret` or `password` written as a JSON
  number or object used to be accepted, and then every request failed with a 500.
- **The IMAP client closes its socket after a greeting that is not OK** (4.1.20): it used to stay open until the
  server hung up.
- **A stopping Telnet connector reads nothing more** (4.1.20): in the second before its sockets are destroyed, bytes a
  client still sends are no longer read.
