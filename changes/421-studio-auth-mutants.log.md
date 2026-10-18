## 4.2.1: the survivors of `studio-auth` read

- **Measured on main** (run 39093187981): 381 of 577 mutants killed, 196 survivors.
- **Killed by unit tests**, one file per source, each driven directly with fakes or a migrated SQLite and a clock
  the test moves: `tests/studio-gate-mutants.test.ts` (each refusal and status; a session's absolute, idle, 5-min
  and R boundaries; what is written back), `studio-store-mutants` (the session key, sealed values, users and
  verified email, members and the last owner, invitations to the millisecond, sessions read back, `touch`, the
  back-channel logout by sid or sub, logins in progress, the audit), `studio-routes-mutants` (which requests each
  route takes, the form's limit, what a callback stores, logout, the owner's routes, errors),
  `studio-oidc-mutants` (lifetime bounds, http, no JWKS, no end-session endpoint, no id_token, non-string claims,
  definitive refusals, access and logout tokens), `studio-leases-mutants` (boundaries on a pinned database clock,
  fences, releases, takeovers, Postgres's clock), `studio-play-mutants` (tickets, a game session's ends and
  sliding, each reason a Studio session no longer carries a game, the ticket's body). The test provider
  (`tests/fixtures/oidc-op.ts`) gained switches for those edges.
- **Named** in `docs/dev/mutants.json` (13): a cookie by the empty name, openid-client's own nonce check, `||` on a missing event, a string's `toString`, a sealed value's guard doubled by its catch, `sid =
  NULL`, read-only transactions, and the idle end of a game session that its absolute end always reaches first.
- **Second reading** (automated second context): a token living 0 s from a future `iat` (which jose lets through)
  is now refused by a test instead of named; the read-only transactions' reason says what differs (locking and
  isolation, not the answers).
- **Result** (local run, then seven kills checked by hand): 564 of 577 killed, 13 explained, none left.
  `studio-auth` is gated; no set is measured any more.
