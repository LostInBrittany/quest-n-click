## ffmpeg's apt fallback bounds its download only, `timeout` under sudo

Seen in passing while fixing #373: `scripts/ci-ffmpeg.sh`'s fallback, after the static build from GitHub fails (#261),
ran `timeout 240 $SUDO apt-get update -qq && timeout 240 $SUDO apt-get install -y -qq ffmpeg`, twice. `timeout` above
sudo is #353's shape (sudo runs apt-get in its own session, out of `timeout`'s process group; #350's retries then failed
on "Could not get lock … held by process … (apt-get)"), and the second bound also covered dpkg, where a kill leaves
packages half-configured. Never seen failing: the fallback only runs when GitHub's download does. Ruling, as #373:
`$SUDO timeout -k 10 240` around `apt-get update` and `apt-get install --download-only -y -qq ffmpeg`, then `$SUDO
apt-get install -y -qq ffmpeg` unbounded, each with `-o DPkg::Lock::Timeout=300` (on the command line, so nothing is
written to `/etc/apt`). Proof: `tests/ci-ffmpeg.test.ts`, its own file so as not to meet #373's `tests/ci-retry.test.ts`:
`timeout` precedes only those two lines and never `$SUDO`; the script run with only stand-ins on its PATH (curl fails,
sudo, timeout and apt-get log, the install leaves an `ffmpeg`): the commands in order, a second download after a pause
when the first runs out of time, no install after two failed downloads. All four red on the old script. The CI page's
row (en, fr) also stops saying `release.yml` carries the same logic: it installs no ffmpeg since #291.

→ next: nothing; the fallback is exercised for real only on a day GitHub's download fails.
