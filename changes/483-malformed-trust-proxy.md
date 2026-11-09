### Fixed

- **A malformed trusted-proxy network is refused at start (next, #483)**: `--trust-proxy=10.0.0.0/` (the Bridge) or
  `"trustProxy": ["10.0.0.0/"]` (the Studio Server) read the empty prefix as `/0` and trusted every address, so any
  client could pick its own `X-Forwarded-For` and step around the per-address limits; `/33` or `/abc` gave odd masks
  too. Both servers now stop at start with an error naming the entry, and such an entry never matches. Plain addresses
  and `a.b.c.d/0` to `/32` behave as before.
