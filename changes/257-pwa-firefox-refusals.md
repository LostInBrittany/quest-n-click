### Fixed

- **An image cached for offline play is served even when the worker's lookup fails (4.5.0, #257)**: Firefox's service
  worker now and then failed a cached image offline ("A ServiceWorker intercepted the request and encountered an
  unexpected error"), a sprite frame then missing. When the image route fails, the worker now looks the image up in
  every cache before giving up, and says why it failed; `npm run e2e:pwa` prints that reason. Nothing to change in a
  game.
