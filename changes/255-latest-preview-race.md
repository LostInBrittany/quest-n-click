### Fixed

- **The hosted Studio's end-to-end run no longer fails at random on "Load the latest preview" (4.5.0, #255)**: the
  script read the last ready preview, then clicked; when a preview finished building in between, the Studio rightly
  loaded the newer one and the check failed (seen on a PR's CI, HTTPS pass). It now waits for the head's preview first.
  Nothing changes in the Studio.
