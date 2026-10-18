# Studio Server: threat model (4.2.1)

**What it does.** A Studio shared by a team on one server (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, ADR
0025 and 0027):
- people authenticate with an OpenID Connect provider (Keycloak or any other), and the rights live in the Studio
  (owner, dev, reviewer);
- the game's files are written through a journal that is durable and fenced;
- hosted, the truth is PostgreSQL and an S3 store (Cellar), and the instance's folder is a cache.

4.2.1 serves the API, the authentication and the members. The game's origin and its tickets (§6.1 of the plan) come
with the client; the processing worker (§3.8) with PR I.

**Assets:**
- the game's sources and assets, which are private to the project;
- the sessions;
- the refresh tokens and id_tokens, encrypted;
- the server's secrets: the OIDC client secret, the session key, the database and S3 credentials;
- the members and the audit log;
- the journal's integrity.

**Adversaries:**
- anyone on the Internet;
- a member with less than the role they act as;
- a hostile page in a member's browser (CSRF);
- a stolen or replayed token;
- a member who leaves while still holding tokens;
- an unreachable or misbehaving provider;
- a second instance of the server during a redeploy.

| Threat | Answer | Test |
|---|---|---|
| Reaching any data without authentication | Every `/api/` route goes through the gate (policy A or B); only `/livez`, `/startz`, `/readyz`, `/auth/login`, `/auth/callback`, `/auth/backchannel` and `/auth/cli` answer without a session, and they hold no project data. Without OIDC configured, `serve` listens on the loopback only | `tests/studio-auth.test.ts` (no session: 401), `tests/studio-server.test.ts` (loopback refusal) |
| CSRF from another site | A cookie mutation needs `Origin` exactly the public URL, `X-Studio-Request: 1` and JSON (a preflight a foreign site cannot pass); the session cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax` | `tests/studio-auth.test.ts` (policy A matrix) |
| Two identities on one request | An `Authorization` header selects policy B and the cookie is ignored: a bad token is a 401 whatever the cookie | test |
| A forged or misused token | Signature by the provider's JWKS (RS256, PS256, ES256, EdDSA; never `none` or HMAC), issuer, **our audience** (distinct from the browser client), `exp − iat` ≤ 5 min, `iat` after the user's `revoked_before`; an id_token as a Bearer is refused | test (`alg: none`, id_token, other audience, 1 h lifetime, non-member) |
| Login flow attacks (code injection, replay, open redirect) | Code + PKCE S256 + state + nonce, checked by `openid-client`; the pre-authentication is used once (10 min); the return path is a plain relative path (letters, digits and `/._~%?&=#+,:@-` only, so no tab or backslash a browser would rewrite) | test (callback replayed, `//evil`, `https://…`, `/\t/evil`) |
| Invitation abuse | One use, 7 days, stored hashed (also while a login carries it); consumed only by the provider-verified email it names; never demotes the last owner | test (other email, unverified, reused, last owner) |
| A member removed keeps working | Sessions deleted and `revoked_before` set at once; a removal, a demotion or an ended session is emitted on the revocation bus, and the live streams (`/api/events`) of that user or session close at once; a stream also closes when its Bearer token ends, and its credential is checked again every 30 s (a demotion below reviewer closes it) | `tests/studio-auth.test.ts` (session 401, Bearer 401 after removal), `tests/studio-collab.test.ts` (a removed member's stream closes within 5 s; a Bearer stream closes at its token's end) |
| A live stream wearing the server down | One read of the leases per change for all the streams (coalesced, in order); a stream more than 1 MiB behind is closed (its client reconnects and reads `/api/ops`); a stream's check of its credential never keeps the session alive | review |
| A member overwriting another's work | Every file belongs to one span; a write claims the spans of its files, all or none, in the transaction of its intent; a span another member holds is a 423 naming them; leases last 120 s, renewed by the heartbeat; a client sending its fences is refused once its lease was taken over; the exclusive lease waits for no span held by another and blocks every claim; a removed or demoted member's leases are released at once | `tests/studio-collab.test.ts` (and the race on Postgres) |
| A hostile game in a member's browser | Everything that runs the game is served on `playUrl`, another origin, chosen by `Host`; it serves no Studio API and the Studio's `__Host-` cookie never goes there. Access is a game session made from a ticket (once, 60 s, a member's browser session, a relative path) and kept in a partitioned cookie (`SameSite=None; Partitioned`), 15 min sliding, never past its Studio session nor R = 15 min after the provider last confirmed that session; every request checks the game session, its Studio session and the membership again. Answers carry `frame-ancestors` the Studio and `no-referrer` | `tests/studio-play.test.ts` |
| An owner's takeover abused | Owners only; audited with the previous holder | `tests/studio-collab.test.ts` |
| A user disabled at the provider | The session is re-checked every 5 min with its refresh token. A definitive refusal ends it; a provider unreachable past R = 15 min suspends it (503, fail closed). One refresh per session at a time, and a slow one still stores the rotated token, so a provider that revokes used refresh tokens never logs anyone out by mistake. A refresh token that no longer opens ends the session. `invalid_client` (our own configuration) is not a refusal of the user | test (simulated clock: disabled, down 16 min, back; 5 concurrent requests, one refresh; a 6 s refresh; an unreadable token) |
| A forged back-channel logout | Form-encoded `logout_token` checked per OIDC Back-Channel Logout 1.0 (signature, `typ`, issuer, audience = client, `events` with an object for the event, no `nonce`, `iat` ≤ 5 min, `jti` never seen). With a `sid`, only that provider session ends; a `sub` alone ends every session and token of the user | test (replay, nonce, no event, JSON body, `sid` + `sub` leaves the other devices) |
| The last owner locked out | The last owner can be neither demoted nor removed (409) | test |
| Secrets leaking | Secrets from 0600 files or Clever's variables, removed from `process.env` at start (children never inherit them), never logged; refresh tokens and id_tokens sealed with AES-256-GCM (key ring of secrets of 32 characters or more; the key and its id derived apart by HKDF); session and invitation tokens stored as sha256; the CLI's token file written whole at 0600 and renamed, under a lock, and sent to https servers only | `tests/studio-server.test.ts` (secrets), `tests/studio-auth.test.ts` (session key, CLI over http) |
| Brute force on `/auth/*` | 30 requests per minute per address on `/auth/*`; past 30 refused credentials per minute, that address's refusals become 429. A request with a valid credential is never slowed, so a stranger cannot lock the team out; with OIDC beyond the loopback, `trustProxy` is required, so clients are told apart behind Clever's proxy | `tests/studio-server.test.ts` (trustProxy required), review |
| Another member's stored answer | A write's stored answer (`x-studio-op`) is kept per author: knowing another member's operation id gives nothing | test |
| A stale instance writing (redeploy) | A fenced service lease plus the journal's fenced per-operation lease; the instance stops writing by its own clock before the lease can expire; Postgres cuts a frozen transaction within 5 s | `tests/studio-journal.test.ts`, `tests/studio-server.test.ts` |
| Content code reading secrets | With OIDC, the game's code (validation and the loads behind the Studio's reads) runs only in `studio-worker`, a separate application with no secret of the platform, in a fresh child with an emptied environment and no pipe, killed with its process group at its deadline; a survivor in the group recycles the instance (a process that leaves the group is not detected: periodic redeploys, ADR 0028). A failure fails the guard closed and is never cached. `loadConfig` refuses OIDC without a worker; captures are unavailable hosted | `tests/studio-worker.test.ts` (emptied environment, deadline, an escaped process does not hang the worker, logs do not corrupt output, no false survivor, failures not cached, the Studio reads through the executor), `tests/studio-server.test.ts` (worker required) |
| A forged or replayed job | Jobs signed with Ed25519 by the Studio, the worker holding the public key only; the signature binds id, instance, epoch, revision, snapshot hash, kind, parameters, staging prefix, expiry (≤ 5 min) and the two presigned URLs; a job is run once per worker process, never after its expiry (checked again when it leaves the queue); another instance's job is refused | `tests/studio-worker.test.ts` |
| A worker naming what the Studio publishes | The Studio reads the result itself (stopping past 32 MiB), checks it answers its job, and deletes the staging prefix; a presigned write reaches its one key only | `tests/studio-worker.test.ts` (another job's answer refused; Cellar scope) |
| A snapshot leaving its folder | Unpacked paths are relative, without `..`, empty segments or dotfiles, text files only, bounded in count and size | `tests/studio-worker.test.ts` |

**Residual risks.**
- **The worker runs hostile code with the job's capabilities in reach** (ADR 0028): the presigned URLs and the job
  token are assumed visible to the job's code and, by persistence, to later jobs of the same worker instance until it
  is recycled. They reach that job's snapshot and result for 5 min at most, nothing else. Verdicts and loads from a
  worker are signals in the project's trust domain, never security decisions.
- **A provider without refresh tokens** gives no way to learn of a revocation before expiry, so such a session lives
  15 min at most.
- **Rate limits are kept in memory**, per instance, and do not survive a restart.
- **Any account at the provider leaves a row.** A login by someone who is not a member creates a user and a session
  that reach nothing (403). With a public provider this grows with logins; `/auth/*` is rate-limited per address.
- **Sealed values are not bound to their row.** Someone able to write the database could move a sealed refresh token
  to another session; they could then do far more anyway.
- **Not yet in 4.2.1 PR 5:** the startup check that refuses a route without a policy, and multipart uploads under
  policy A, come with the client routes (PR 7).
- **A lease names a span, not a member's intent:** a member holding a room may write anything in it. Spans are the
  unit of coordination between trusted members, not of authorisation.
- **The game session's cookie is partitioned (CHIPS)** because `*.cleverapps.io` makes the two origins different
  sites. Spike S found it accepted by Chromium, Firefox and WebKit with default settings; a real Safari, on macOS and
  iOS, is checked by the `studio-hosted` pass. Two origins on one site (a custom domain) need nothing more.
- **A ticket travels in a URL** (`/_ticket?t=`): a proxy in front of the server may log it. It is used once within 60 s,
  so a logged ticket is spent; the server's own log records the path without the query.
- **Login CSRF on the game's origin:** someone who gets a member to open their own ticket puts that member's game frame
  in their game session. It stays within the same project and reads only its previews.
- **Presence lives in memory** and is lost on a restart (members reappear at their next heartbeat).
- **`fsync` on macOS is not `F_FULLFSYNC`.** This only matters in local mode.
