## 4.2.1 PR 7 (first part): the hosted Studio's page and the game's live preview

Branch: feature/421-client · Plan §6.1, §6.2, §7 row 7 · mock-ups approved by the maintainer (18 Oct.)

- **The Studio's page on its origin** (`studio-server/src/server/client.ts`): the built Studio (`npm run studio-client`:
  `studio.html` alone, no game, no public files, no service worker), with a meta tag naming its API and the game's
  origin, and a Content-Security-Policy (scripts and requests to its own origin, frames to the game's only, framed by
  nobody else). Its scripts, its icon and font to anyone; the game's images and sounds to members only.
- **The live preview on the game's origin** (`preview.ts`): Vite in middleware mode, behind the game session, GET only,
  no websocket (Vite's client module is a stub that still sets the build's constants), dependencies bundled once at
  start; an allow-list of paths before Vite and `fs.strict` behind it; the game's `private/`, `tests/`, `playtests/`
  never served.
- **The client on a hosted Studio** (`api-base.ts`, `game-origin.ts`): the API under `/api`, the CSRF header on every
  request, a 401 sends to the login; the Rooms editor, the Play tab and the game links open on the game's origin with a
  ticket. The editor never writes there: the Studio asks for the layout with a nonce and writes it itself; anything
  else it sends is ignored. Undo and the Assistant hidden; the Play tab's inspector panels left out.
- **Tests:** `tests/studio-client.test.ts` (the page, its policy, its files, members-only media, the preview's
  allow-list, no Studio API on the game's origin); `scripts/e2e-studio-hosted.ts` (`npm run e2e:studio-hosted`, in the
  `studio-hosted` job): login, Rooms on the game's origin, the solicited save, an unasked layout ignored, the game's
  page kept from the Studio's page and API, Play, logout ending the game session; Chromium over http, WebKit over
  https (WebKit keeps no `Secure` cookie over http, even on the loopback).

→ next: Claude (PR 7, second part: the screens of the mock-ups: login, access refused, revision, presence, leases,
conflicts, members)
