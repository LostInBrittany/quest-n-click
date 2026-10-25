### Changes

- **A resumed `npm run release -- <version>` verifies the release once (4.5.5, #343)**: run again after a stop (4.5.4's
  at the npm 2FA step), it ran `ship verify` from scratch, about 5 minutes on 35 files. After a passing verify it now
  records the tag object, its commit, the release and each asset's digest in
  `.cache/release/v<version>.verified.json`, and a later run skips the verify only when all of it is still exactly
  there and the release is immutable, saying when it passed; otherwise, or with `--reverify`, it verifies again.
  `ship verify` and the release workflow's own verify are unchanged.
