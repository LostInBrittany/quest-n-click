### Changes

- **The setup action's `npm ci` waits out a registry hiccup (next, #539)**: `.github/actions/setup` runs
  `node scripts/npm-install.mjs ci`, the retry the archive scripts already used (#471): tried again only on a registry
  error a later try can pass (a 404 on a tarball, ETARGET, the network, a 5xx or a 429) or an attempt over its 3
  minutes, four times at most, 30, 60 then 120 s apart, `--prefer-online` after the first. A peer conflict or a failed
  build script fails at once instead of three times. Each attempt is bounded on Linux and macOS (not on Windows), and
  every step that calls the action has 17 minutes instead of 10: 4 × 3 min + 3.5 min of pauses, and a minute to spare.
