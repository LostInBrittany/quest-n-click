### Fixed

- **The WebKit e2e run no longer fails at random on "Context is stopped" after its save check (4.5.1, #263)**: the
  save round trip reloads the page; when the offline warm-up had a Cache API call in flight, WebKit logged "Cache API
  operation failed: Context is stopped" and the run failed, every check passed (4 times in 5 days on CI). WebKit logs
  it itself, even for a promise the page catches, so the run now tolerates it during that reload as it already did
  during the teardown: reported, not counted, on WebKit only, in that exact form. Nothing changes in the engine.
