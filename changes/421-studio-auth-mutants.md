### Changes

- **The Studio Server's trust boundaries are held by mutation testing** (4.2.1): the set `studio-auth` (the gate,
  the OpenID client, the routes and store of authentication, the spans' leases, the game's origin) is gated, every
  surviving mutant killed by a test or named.
