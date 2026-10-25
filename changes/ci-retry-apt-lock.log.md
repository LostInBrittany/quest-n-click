## apt out of the per-attempt timeout

#342 (#340) put `timeout 6m` around each attempt of the install loops. On #350 (run 40238669117, `studio-hosted`) the
mirror was slow again: at 22:20:12 `timeout` killed npx and Playwright, but the apt-get Playwright ran through `sudo`
(pid 6923) survived the signal and went on fetching (`Get:22` to `Get:26` after "retry 1") and held
`/var/lib/dpkg/lock-frontend`; retries 2 and 3 failed in a second on "Could not get lock". Of the 74 bounded loops,
only the four `playwright install --with-deps` run apt. Rulings: never kill apt (killing dpkg mid-install needs
`dpkg --configure -a`, and the signal `timeout` sends to its group did not reach that apt-get); make it fail and wait by itself, an
apt.conf.d file with `Acquire::http(s)::Timeout "60"` (a mirror that sends nothing), `Acquire::Retries "3"` and
`DPkg::Lock::Timeout "300"` (unattended-upgrades, a leftover attempt); a slow mirror that still sends is waited for
within the step's 20 minutes. `scripts/ci-playwright-deps.sh <browser>…` writes it and runs `npx playwright
install-deps` three times; the browsers' loop (`npx playwright install <browser>…`, Playwright's CDN, no sudo) keeps
`timeout 6m`. `studio-hosted`'s job goes from 30 to 40 minutes. `tests/ci-retry.test.ts`: no loop runs apt, sudo,
`--with-deps` or `install-deps`; the four jobs (pinned) call the script for the same browsers before their download,
in a step with `timeout-minutes`; the script sets the four options, runs nothing under `timeout`, and parses
(`bash -n`). The CI plan sends a change of the script to `studio-hosted`. The CI page's known-flakes row (en, fr).

→ next: watch the next slow-mirror day: the deps step should take longer, never fail on a lock.
