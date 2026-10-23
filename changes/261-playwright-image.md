### Fixed

- **The browser jobs of CI no longer time out installing Playwright's system packages (4.5.1, #261)**: seven Linux
  jobs (`e2e`, `reality`, `pwa-firefox`, `cross-runtime`, `fresh-install`, `second-game`, `reference`) run in
  Playwright's own image, the lockfile's version pinned by digest, where the browsers and their libraries are already
  installed; `--with-deps` fetched 52 MB from an apt mirror that sometimes served 50 kB/s. A test keeps the image's
  version equal to the lockfile's.
