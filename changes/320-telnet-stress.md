### Changes

- **The unit suite can be green on a developer's Mac (4.5.5, #320)**: the Telnet connector's stress test (a thousand
  connections at once, which macOS's default limits fail) runs only where `CI` is set, as on every GitHub Actions
  job, or with `TELNET_STRESS=1`; skipped otherwise.
