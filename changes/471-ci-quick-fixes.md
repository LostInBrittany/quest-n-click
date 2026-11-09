### Fixed

- **The installs from the registry without a lockfile try again on a registry hiccup (next, #471)**: `fresh-install`,
  `upgrade-check`, `external-consumer`, `connector-archive-e2e`, `studio-install-smoke`, the qualification's backup
  step and the PR's connectors job each ran `npm install` once, and failed when the registry's index listed a version
  whose tarball its CDN did not serve yet (run 42633058102: a 404 on `rollup` `4.68.2`'s tarball, published a minute
  before). One helper in `scripts/lib/archive-harness.mjs` now tries again after 30, 60 and 120 s on a 404 on a
  tarball, `ETARGET`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, a 429 or a 5xx, says each new try and why on stderr, and
  asks the registry again rather than its cache (`--prefer-online`). Any other failure – a name that does not exist, a
  peer conflict, a build script – still fails at once, with npm's own output.
- **The Studio's Git tests have 60 s on Windows (next, #471)**: two of them passed 30 s on a slow Windows runner in run
  42633058102. Linux and macOS keep 30 s.
