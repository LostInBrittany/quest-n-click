## 4.2.1 PR 7, server side: the game's origin

Branch: feature/421-play (stacked on PR 6) · Plan §6.1, policy F

- **`studio-server/src/server/play.ts`** (migration 0005): tickets (hashed, once, 60 s, a relative path, a member's
  browser session only); game sessions (hashed, 15 min sliding, never past the Studio session they come from,
  checked at every request with the Studio session and the membership); the `__Host-ws_play` cookie, `Secure;
  HttpOnly; SameSite=None; Partitioned`; `frame-ancestors` the Studio, `no-referrer`, `no-store`.
- **`http.ts`:** routing by `Host`: the game's origin answers only its own paths; `POST /api/play-ticket` (policy A,
  reviewer). **`store.ts`:** `sessionByHash`. **`main.ts`:** the game's origin, without content until the live preview
  is mounted (the client, PR 7).
- **The cookie, a provisional choice:** CHIPS is the one cookie spike S saw accepted by Chromium, Firefox and WebKit,
  default settings, across the two sites of `*.cleverapps.io`. The maintainer's real Safari (macOS, iOS) confirms or
  reverses it.
- **Tests:** `tests/studio-play.test.ts`, 5 cases: no API on the game's origin, the ticket and its cookie, expiry,
  relative paths only, no ticket to a Bearer, the game session ending with its Studio session or the membership, and
  after 15 min unused.

→ next: Claude (PR 7, the client, after the maintainer validates the mockups)
