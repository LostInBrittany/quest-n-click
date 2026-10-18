### Fixed

- **The e2e run tolerates WebKit's "Context is stopped"** when every check has passed (WebKit tearing its context down
  at the end of the run, a Cache API call cut short): reported as a warning, as `e2e:pwa` does since 4.1.20, never
  before the checks are done nor in another browser.
