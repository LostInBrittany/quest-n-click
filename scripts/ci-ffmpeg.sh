#!/usr/bin/env bash
# ffmpeg on a GitHub runner (4.1.15): apt first, bounded, then a static build from GitHub's CDN when the apt mirror
# hangs (7 October 2026: `apt-get update` sat 20 minutes without a byte on several runners). ffprobe comes along.
set -u
# Root in Playwright's container (#261), where there is no sudo; the runner's user elsewhere.
SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=
command -v ffmpeg >/dev/null 2>&1 && { ffmpeg -version | head -1; exit 0; }
for i in 1 2; do
  if timeout 240 $SUDO apt-get update -qq && timeout 240 $SUDO apt-get install -y -qq ffmpeg; then ffmpeg -version | head -1; exit 0; fi
  echo "apt attempt $i failed or hung; retrying" >&2; sleep 10
done
echo "apt gave up: a static build from GitHub (BtbN/FFmpeg-Builds)" >&2
url=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
tmp=$(mktemp -d)
curl -fsSL --retry 3 --max-time 600 "$url" -o "$tmp/ffmpeg.tar.xz" || { echo "static ffmpeg download failed" >&2; exit 1; }
# The container has no xz: Python's lzma then (Python is set up before this script wherever it runs).
if command -v xz >/dev/null 2>&1; then tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp"
else python3 -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2])' "$tmp/ffmpeg.tar.xz" "$tmp"; fi
$SUDO install -m 0755 "$tmp"/ffmpeg-master-latest-linux64-gpl/bin/ffmpeg "$tmp"/ffmpeg-master-latest-linux64-gpl/bin/ffprobe /usr/local/bin/
ffmpeg -version | head -1
