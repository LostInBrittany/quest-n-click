#!/usr/bin/env bash
# Playwright's system packages on a GitHub runner (4.5.5, #353), apart from its browsers' download:
#   bash scripts/ci-playwright-deps.sh <browser>…
# Never under `timeout`: `timeout` killed `npx playwright install --with-deps`, not the apt-get Playwright ran through
# sudo, which went on downloading and held /var/lib/dpkg/lock-frontend, and the two retries failed on that lock at
# once (#350). apt is made to fail by itself instead: a mirror that sends nothing for a minute fails the attempt, a file
# is fetched again before that, and an attempt waits for a lock still held (unattended-upgrades, an earlier attempt)
# rather than failing. A slow mirror that still sends is waited for, within the step's timeout-minutes.
set -u
[ "$#" -gt 0 ] || { echo "usage: bash scripts/ci-playwright-deps.sh <browser>…" >&2; exit 2; }
# Root in a container, where there is no sudo; the runner's user elsewhere.
SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=
printf '%s\n' \
  'Acquire::http::Timeout "60";' \
  'Acquire::https::Timeout "60";' \
  'Acquire::Retries "3";' \
  'DPkg::Lock::Timeout "300";' | $SUDO tee /etc/apt/apt.conf.d/90-ci-playwright-deps >/dev/null || exit 1
for i in 1 2 3; do
  npx playwright install-deps "$@" && exit 0
  echo "playwright install-deps: attempt $i failed" >&2
  [ "$i" = 3 ] || sleep 15
done
exit 1
