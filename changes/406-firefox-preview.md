### Fixed

- **`e2e:studio-hosted`, a layout written meanwhile, read as a member sees it (next, #406)**: the step no longer
  clicks "Reload view" on the stale preview before the Studio reloads the view by itself (one navigation, not two).
  In Firefox, Playwright's handle on the editor's iframe can lose a navigation and never answer again while the
  view itself loaded and told the Studio so: a frame silent for 15 s now gets a new Studio page (a new iframe, a
  new handle) instead of a second click, which never brought it back. The step says how many `ready` messages the
  Studio received from the view meanwhile, and a frame that never answers fails the run in about a minute with that
  evidence, instead of holding it to its 8-minute limit.
