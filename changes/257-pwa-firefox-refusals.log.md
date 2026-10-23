## 4.5.0: the image route's last resort, and its reason told (#257)

- `pwa-firefox` failed twice on 2026-10-23 (`main` run 39954872309, PR #253 run 39961281118): every step passed, then
  three cached cat frames refused offline by Firefox's worker, over `MAX_REFUSED = 2` in `scripts/e2e-pwa.mjs`. The
  reason was logged nowhere: the test could only count.
- `vite.config.ts`: `imageLastResort`, a workbox plugin on the `/assets/img/` route (`CacheFirst`, `jeu-images`). Its
  `handlerDidError` runs when the strategy throws (a cache read failing, the expiration plugin, `no-response`): it
  answers with `caches.match(request)` across every cache, and posts `{ type: 'qnc-sw-error', url, reason, recovered }`
  to the open pages (the game ignores it). Workbox copies the plugin into `sw.js` as text: nothing from the config's
  scope.
- `scripts/e2e-pwa.mjs`: an init script relays each `qnc-sw-error` to the console as a warning; the run prints them
  (and a CI `::warning::` with the distinct reasons), not counted. `MAX_REFUSED` is unchanged: a refusal the worker
  recovered from no longer reaches the browser's console, one it could not still counts.
- Checked (Chromium, `vite preview`, offline after the warm-up): an image removed from `jeu-images` but kept in another
  cache answers 200, reported `recovered: true` (`no-response`); an image in no cache still fails, reported
  `recovered: false`. `npm run e2e:pwa -- --serve=dist --update --interrupted --reinstall` passes in Chromium. Firefox
  does not launch on this machine: CI's `pwa-firefox` will show the actual reason. If it shows none, Firefox's error is
  outside workbox's handler (the `respondWith` itself), which this does not reach.

→ next: review.
