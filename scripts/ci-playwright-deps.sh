#!/usr/bin/env bash
# Playwright's system packages on a GitHub runner (4.5.5, #353; 4.5.6, #373), apart from its browsers' download:
#   bash scripts/ci-playwright-deps.sh <browser>…
# An attempt downloads, then installs.
# - The download is bounded: `apt-get update`, then `apt-get install --download-only` of the packages Playwright reports
#   missing, each under a `timeout` that sudo runs, so `timeout` is apt-get's own parent and kills it. An apt-get killed
#   while downloading releases its locks and has not started dpkg. On #373 the runner's first mirror sent 40 kB/s,
#   never a minute of silence, and one attempt spent the step's 20 minutes downloading: apt has no low-speed limit.
# - The install, `npx playwright install-deps` with the packages already in apt's cache, is never under `timeout`:
#   `timeout` killed npx, not the apt-get it ran through sudo, which went on downloading and held
#   /var/lib/dpkg/lock-frontend, and the two retries failed on that lock at once (#350, #353).
# A retry puts the first mirror of the runner's list (/etc/apt/apt-mirrors.txt: azure.archive.ubuntu.com, then
# archive.ubuntu.com, then security.ubuntu.com) last: apt moves to the next mirror on a failed file, never on a slow
# one. What an attempt fetched stays in apt's cache, partial files included, for the next.
# apt also fails and waits by itself: a mirror that sends nothing for a minute fails a file, a file is fetched again,
# and an attempt waits for a lock still held (unattended-upgrades, an earlier attempt) rather than failing.
# Three attempts of at most 2 + 3 minutes of download, the two pauses and an install fit the step's 20 minutes.
set -u
[ "$#" -gt 0 ] || { echo "usage: bash scripts/ci-playwright-deps.sh <browser>…" >&2; exit 2; }
APT_ETC=${CI_APT_ETC:-/etc/apt}
# Root in a container, where there is no sudo; the runner's user elsewhere.
SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=
printf '%s\n' \
  'Acquire::http::Timeout "60";' \
  'Acquire::https::Timeout "60";' \
  'Acquire::Retries "3";' \
  'DPkg::Lock::Timeout "300";' | $SUDO tee "$APT_ETC/apt.conf.d/90-ci-playwright-deps" >/dev/null || exit 1

# The mirror tried first (priority 1) goes last; a list without one (a container, an earlier retry) is left alone.
demote_first_mirror() {
  local list="$APT_ETC/apt-mirrors.txt" first next
  [ -f "$list" ] || return 0
  first=$(awk -F '\t' '$2 == "priority:1" { print $1 }' "$list")
  [ -n "$first" ] || return 0
  next=$(sed $'s/\tpriority:1$/\tpriority:9/' "$list") || return 0
  printf '%s\n' "$next" | $SUDO tee "$list" >/dev/null && echo "apt: $first is now the last mirror tried" >&2
}

# The lists, then the .deb files of what `install-deps --dry-run` reports missing (one "  <package>" a line).
download() {
  local missing
  $SUDO timeout -k 10 2m apt-get update || return 1
  missing=$(npx playwright install-deps --dry-run "$@" | sed -n 's/^  \([a-z0-9][a-z0-9.+-]*\)$/\1/p')
  [ -n "$missing" ] || return 0
  # shellcheck disable=SC2086 # one word a package
  $SUDO timeout -k 10 3m apt-get install --download-only -y --no-install-recommends $missing
}

for i in 1 2 3; do
  [ "$i" = 1 ] || demote_first_mirror
  if download "$@"; then
    npx playwright install-deps "$@" && exit 0
  fi
  echo "playwright install-deps: attempt $i failed" >&2
  [ "$i" = 3 ] || sleep 15
done
exit 1
