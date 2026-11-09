### Fixed

- **The dev server no longer serves a game's `private/` folder (next, #477)**: in `npm run dev:lan` or `studio:lan`,
  anyone on the same network could fetch `/games/<id>/private/…` – the raw sheets and the real ending's configuration
  – without the token, which guards only the Studio's routes. Vite's `server.fs.deny` now lists `**/private/**` (with
  Vite's own defaults), in the engine repo and in a game project: such a path answers 403, encoded, upper-case or
  through `/@fs/`.
