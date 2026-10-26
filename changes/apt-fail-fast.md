### Fixed

- **A slow apt mirror no longer spends CI's whole Playwright packages step on one attempt (4.5.6, #373)**: on main's
  run 40315817057, `studio-hosted`'s `scripts/ci-playwright-deps.sh` downloaded from `azure.archive.ubuntu.com` at
  about 40 kB/s, never a minute without a byte, and the step's 20 minutes ran out before the second attempt. An attempt
  now downloads first, `apt-get update` and the packages Playwright reports missing (`install-deps --dry-run`), bounded
  to 2 and 3 minutes by a `timeout` that sudo runs, so it kills apt-get itself before dpkg starts; then it installs them
  from apt's cache with nothing bounded, as #353 wants. A retry puts the runner's first mirror last
  (`/etc/apt/apt-mirrors.txt`), since apt changes mirrors on a failed file, never on a slow one; what an attempt
  fetched, partial files included, stays for the next.
