### Fixed

- **CI's ffmpeg apt fallback no longer leaves an apt-get holding the dpkg lock, nor cuts dpkg (4.5.6, #374)**: when
  the static ffmpeg cannot be fetched from GitHub, `scripts/ci-ffmpeg.sh` ran `timeout 240 $SUDO apt-get …`, `timeout`
  above sudo, the shape #353 removed: it killed sudo, not apt-get, and its four minutes also covered dpkg. Now sudo runs
  `timeout`, apt-get's own parent, around `apt-get update` and `apt-get install --download-only ffmpeg` only; the
  install, from apt's cache, is not bounded and waits for a lock still held (`DPkg::Lock::Timeout`). The CI page no
  longer says `release.yml` installs ffmpeg (it has not since #291).
