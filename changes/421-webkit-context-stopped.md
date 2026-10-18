### Fixed

- **The e2e run tolerates WebKit's "Context is stopped"** during its teardown (WebKit stopping its context as the run
  ends, a Cache API call cut short): reported as a warning, as `e2e:pwa` does since 4.1.20, only for an error that
  came after every check passed, on WebKit, in that exact form.
