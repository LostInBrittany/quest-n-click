## The Dependabot pull requests of 11 October (#95–#102), in one branch

- The user asked to handle the bots' pull requests; they had waited through the 4.1.19 release, since `release.yml`
  runs `main`'s copy and three of them change actions it uses. One branch instead of seven CI cycles; each bot PR is
  closed with a pointer here, #101 with its reason.
- **#100 (Playwright 1.64) was red on WebKit's PWA test, reproduced locally:** the "interrupted update" scenario makes
  the test's server answer `sw.js` with a deliberate 500; WebKit now also prints that answer as a console error. The
  test excuses exactly those responses (500, `/sw.js`, not from the worker, while the failure is armed), one console
  line each, and says how many. Green on WebKit, Chromium and Firefox locally.
- **#101 (`@types/node` 26) closed:** five type errors (`CryptoKey`/`CryptoKeyPair`, `JsonWebKey`, a catch variable)
  that are Node 26's types, not bugs on Node 22. `.github/dependabot.yml` ignores its majors.
- **#96 (`checkout` 7):** red only on the Firefox PWA flake (`pwa-firefox`, documented). v7 refuses a fork PR's
  checkout under `pull_request_target`/`workflow_run`; `release.yml` (workflow_run) checks out this repository's own
  tag, never a fork: unaffected, and the next release run is where it is proved.
- Every new pin's SHA checked against the official tag (`git/ref/tags`): five matches. 137 pins updated, the 4.1.19
  jobs included. Locally: `quality`, `test:node` (233 files), `build:studio-demo` (`cross-env` 10).

→ next: CI and a candidate (`full-ci`: download-artifact 8 and attest 4 exercised), merge, close the bot PRs.
