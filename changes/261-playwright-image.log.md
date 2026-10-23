## 4.5.1: CI browser jobs in Playwright's image (#261)

- The cause: `npx playwright install --with-deps` downloads the browsers fast, then 51.6 MB of `.deb` (fonts, GLib,
  codecs) from `azure.archive.ubuntu.com`, at about 50 kB/s on 23 October 2026 (job 120463321470: `fonts-wqy-zenhei`
  alone 2 min 40 s). Four jobs failed on it that day (PR #260's `pwa-firefox` and `reality (webkit)`, `studio-hosted`
  twice on main); the three-attempt loop cannot help, the first attempt eats the step's time.
- The fix: `container:` `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b5…` on `e2e`, `reality`, `pwa-firefox`,
  `cross-runtime`, `fresh-install`, `second-game`, `reference`; their install step removed. The image only when the
  plan runs the job (`${{ gate && image || '' }}`: a spared job stays on the runner, no 2 GB pull to print a notice).
  `--init --ipc=host` (Playwright's advice for Chromium); `HOME: /root` (Firefox under root); `safe.directory` after
  the checkout (owned by the runner's user). `scripts/ci-ffmpeg.sh` runs as root without sudo, and unpacks its static
  fallback with Python when `xz` is missing (the image has none).
- `tests/ci-plan.test.ts`: the image's version is the lockfile's `playwright`, pinned by digest, in those seven jobs,
  none of which installs a browser.
- Left out: `studio-hosted` starts its own containers (SeaweedFS, Keycloak) with `docker run` on the runner, so it keeps
  the install; `windows` installs no system package; `candidate.yml`, `nightly.yml` and `release.yml` keep theirs for
  now.
- Checked: `tests/ci-plan.test.ts`, the YAML parsed; the jobs themselves only run on CI.

→ next: this PR's CI, then the same for the other workflows if it holds.
