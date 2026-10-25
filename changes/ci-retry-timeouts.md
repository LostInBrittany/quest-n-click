### Fixed

- **An install attempt that stalls in CI no longer spends the whole step (4.5.5, #340)**: the workflows' retry loops
  (`npm ci`, `pip install`, `playwright install --with-deps`, `docker pull`, the candidate's image and Studio install
  smokes, the release's pinned npm) give each of their three attempts its own `timeout <n>m` on Linux, and each step's
  `timeout-minutes` leaves room for the three and the two pauses. On #338 apt served a few kB/s under `playwright
  install --with-deps` and the first attempt ran out the step's 10 minutes, so the retries never ran; that step now has
  20 minutes, 6 an attempt, and the 8-minute install steps have 10. The macOS and Windows jobs keep the step's limit
  only (no `timeout` there), said in a comment. A test pins the rule over every workflow.
