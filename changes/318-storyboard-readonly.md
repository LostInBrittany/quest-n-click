### Changes

- **A read-only storyboard to publish beside the game (4.5.4, #318)**: `npm run page:storyboard -- --readonly` renders
  the same story without the notes box, the rewrites or any saving, with a `noindex, nofollow` meta. The game's service
  worker no longer answers `pages/` with the game, so such a page (or any page a game publishes beside itself under
  `pages/`) can live in the same `dist/`.
- **`quest-n-click page` in a created project (4.5.4, #318)**: the phone pages (`storyboard`, with `--md` and
  `--readonly`, `review`, `placement`, `world`, `puzzles`) were only `npm run page:*` scripts of the engine repository;
  a project now writes them with `npx quest-n-click page <name> [options]`. Found while moving clever-onboarding onto
  the npm package, whose deploy script becomes `npx quest-n-click page storyboard --readonly --out
  dist/pages/storyboard-$SLUG.html`.
