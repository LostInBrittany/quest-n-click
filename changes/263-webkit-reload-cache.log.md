## 4.5.1: e2e, WebKit's "Context is stopped" tolerated during the save round trip's reload (#263)

- Cause: `e2e (webkit, keyboard, false)` failed 4 times in 5 days (run 39539641390, job 120463400276; 39967673186
  and 39416255342 green on rerun) on `pageerror Cache API operation failed: Context is stopped`, after "a manual save
  survived a reload" and "e2e: done". `harness.saveRoundTrip()` reloads the page while the offline warm-up
  (`dom/assets.ts` `warm()`) may have a `caches.match` in flight; WebKit stops it with its document. The excuse in
  `scripts/e2e.mjs` covered only errors collected after "done" (the teardown).
- Not an unhandled rejection: WebCore logs the stopped call itself, a console message of source JS and level error
  ("Cache API operation failed: <reason>"), and Playwright's WebKit backend reports those as `pageerror` (its name
  "Cache API operation failed", its message "Context is stopped", no stack: the CI line's exact shape). A page that
  catches every Cache API promise and is reloaded ten times got it twice. `warm()` already catches: there is nothing
  to handle in the engine.
- Fix: `scripts/e2e.mjs` records the stretches of `harness.errors` in which a document goes away, the save round trip
  and the browser's close (`stopWindow`), and excuses the error only inside them, only once every check passed, only
  on WebKit and in its seen form. An error outside them still fails the run.
- Checked: WebKit keyboard e2e (`--prod --generic --keyboard --save --no-indexeddb --axe`, `vite preview`) 6/6 green;
  Chromium 1/1. With a Cache API loop injected into the page and extra reloads before the walkthrough (a temporary
  copy of the script), the error from those reloads counted and failed the run, one inside a window was reported and
  not counted.

→ next: review.
