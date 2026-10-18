### Changes

- **The hosted Studio shows the preview of a revision (4.2.2)**: after each change the processing worker builds the
  game at the head (a new job kind, `preview`; a burst of changes builds its last revision only), the Studio stores its
  files by content and serves them on the game's origin at `/preview/<rev>/`, behind the game session. The room view
  loads a newer preview once it is built, unless a placement is not saved; the label under it names the revision
  shown, the one building, and a revision that does not build, with its reason. The editing tools enter the preview's
  build (`VITE_STUDIO_PREVIEW`); the player's build is unchanged.
- **Vite has left the Studio Server (4.2.2)**: 4.2.1's live preview (Vite in middleware mode on the game's origin) is
  gone, with its allow-list of engine paths; the game's origin serves a revision's built files and the prepared assets
  of `publicDir` only. The worker still needs the engine's Vite to build.
