### Changes

- **The hosted Studio opens in a browser** (4.2.1): the Studio Server serves the Studio's page
  (`npm run studio-client` builds it; `CC_POST_BUILD_HOOK` on Clever Cloud), which talks to `/api` and logs in
  through the provider. The game runs on its own origin as a live preview (Vite behind the game's session, not frozen
  at a revision): the Rooms editor and the Play tab open there with a ticket, and the editor hands its layout to the
  Studio, which writes it as the member. Undo, the Assistant and the Assets tab are not on a hosted Studio yet; the Play tab's
  inspector panels need the local Studio. New optional settings `publicDir` and `clientDir`
  (`docs/en/STUDIO-SERVER.md`).
