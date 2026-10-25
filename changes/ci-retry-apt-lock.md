### Fixed

- **A slow apt mirror no longer makes CI's Playwright install fail on a lock (4.5.5, #353)**: since #340 each attempt
  of `npx playwright install --with-deps` ran under `timeout`, which killed Playwright but not the apt-get it started
  through sudo; that apt-get went on holding the dpkg lock, and the second and third attempts failed on it at once
  (#350). The four jobs that install browsers on the runner (`studio-hosted`, the candidate's `release-core` and
  `cross-runtime`, the nightly's `cross-runtime`) now install Playwright's system packages with
  `scripts/ci-playwright-deps.sh`, never under `timeout`: apt fails by itself when the mirror sends nothing for a minute,
  retries a file, and waits for a lock still held; the browsers' download keeps its limit an attempt. `studio-hosted`
  has 40 minutes instead of 30 for a slow mirror.
