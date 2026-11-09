### Fixed

- **The website's demo goes through the spoiler check before it is published (next, #507)**: the candidate built
  `web.tar.gz` (the game and the Studio demo under `/demo/`) with a plain `vite build`, which runs no
  `check:spoilers`, and that build ships the storyboard and the owner's notes as JSON in
  `studio-demo/snapshot.json`. One ending line in a note would have reached the website. The candidate now runs
  `npm run check:spoilers` on it before packing it, and `ci` runs it on the same two-entry build, so a pull request
  that puts ending text in the storyboard or a note fails there rather than at the release.
