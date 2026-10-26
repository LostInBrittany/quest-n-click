## A slow apt mirror fails an attempt fast, and the retry uses another mirror

Main's run 40315817057 (26 Oct 2026), `studio-hosted` attempt 1: `bash scripts/ci-playwright-deps.sh chromium firefox`
timed out at the step's 20 minutes. The log: `apt-get update` at 9.5 MB/s, then `Need to get 53.7 MB` from
`azure.archive.ubuntu.com` at ~40 kB/s (`Get:2` 3513 kB in 86 s, `Get:18` 8998 kB in 236 s), still on `Get:41` of 48
when the step was killed; two `Ign:` lines (a file left for another mirror). No lock wait, no dpkg: #355's
`Acquire::http::Timeout "60"` fails a mirror that sends nothing, and this one always sent a little, so the first of
three attempts never failed. The runner's apt has a failover (`mirror+file:/etc/apt/apt-mirrors.txt`, 144 B in the
log: azure priority 1, archive.ubuntu.com 2, security.ubuntu.com 3, from actions/runner-images'
`configure-apt-sources.sh`), but the mirror method moves on only when a file fails. apt has no low-speed limit, so the
bound is a `timeout`, on the download alone: `$SUDO timeout -k 10 2m apt-get update`, then `$SUDO timeout -k 10 3m
apt-get install --download-only -y --no-install-recommends` of the packages `npx playwright install-deps --dry-run`
lists (Playwright 1.64 simulates with `apt-get install -s` and prints one `  <package>` a line). sudo runs `timeout`,
which is apt-get's own parent and signals its process group: #353's orphan came from `timeout` above sudo. A killed
download has not started dpkg, and an exiting apt-get frees its fcntl locks. Then `npx playwright install-deps`
unbounded, from the cache. Before attempt 2, the priority-1 mirror goes to 9. Three attempts of at most 5 minutes, the
pauses and the install fit the 20 minutes. Proof: `tests/ci-retry.test.ts` runs the script against stubs (sudo, id,
sleep, timeout, npx, apt-get) in a directory of its own (`CI_APT_ETC`, now in the env register): the order of the
phases, sudo above `timeout`, the mirror demoted once after a failed download, nothing downloaded when nothing is
missing, no mirror list in a container, exit 1 after three attempts; the static test pins that `timeout` only precedes
those two apt-get lines. Red on the old script. Not run on a real runner here: this PR's `studio-hosted` is its first.
Seen in passing: `scripts/ci-ffmpeg.sh`'s apt fallback (after the static build) runs `timeout 240 $SUDO apt-get`,
`timeout` above sudo, the shape #353 removed; left as is, it only runs when GitHub's download fails.

→ next: the PR's `studio-hosted` run, the first real one of the two phases.
