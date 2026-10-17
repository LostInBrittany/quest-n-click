## 4.2.1 PR 5: OpenID Connect, rights in the Studio, bounded revocation

Branch: feature/421-oidc (stacked on PR 4) · Plan §3, ADR 0027, threat model `docs/dev/threat-models/studio-server.md`

- **`studio-server/src/server/auth/`:**
  - `oidc.ts`: the RP on `openid-client` 6.8.8 and `jose` 6.2.12, exact pins. Login, refresh (definitive refusal
    vs unreachable), end-session URL, Bearer verification (JWKS, issuer, audience, algorithms, lifetime ≤ 5 min, no
    id_token), logout-token verification.
  - `store.ts`: users, members, invitations (hashed, one use, verified email), sessions (hashed ids, sealed refresh
    and id tokens, AES-256-GCM key ring), pre-authentications (one use), the `jti` replay cache, audit.
  - `gate.ts`: policies A and B chosen by the request, the role per route (`roleFor`: GET and read-only POSTs are a
    reviewer's, writes a dev's), revocation within R (check every 5 min, fail closed after 15), and a revocation bus
    for long connections.
  - `routes.ts`: `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/backchannel`, `/auth/me`, `/auth/cli`, and
    the owner's members, invitations and audit routes.
  - `device.ts`: the CLI's device flow, tokens in a 0600 file, renewal.
- **Migration 0003:** identity, membership, sessions, audit.
- **The server:**
  - operations are authored by the session's email;
  - 429s per address on `/auth/*` and on failed authentications;
  - `serve` beyond the loopback only with OIDC configured;
  - `studio-server invite`, `login`, `token`.
- **Tests:**
  - `tests/studio-auth.test.ts` (17 cases), against a test provider (`tests/fixtures/oidc-op.ts`: discovery, JWKS,
    code with PKCE, refresh, device flow, refusals);
  - the role matrix is checked over every API route.
- **Not here:**
  - the game's origin and its tickets (policy F), with the client (PR 7);
  - closing SSE streams on revocation, with SSE itself (PR 6), on the bus that is ready;
  - a real Keycloak in CI (PR 9). The spike's managed Keycloak announces every endpoint used here.

→ next: Claude (PR I, the separate worker; then PR 6)
