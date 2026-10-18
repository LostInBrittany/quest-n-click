### Changes

- **The hosted Studio is tested against a real Postgres and S3 in CI** (4.2.1): a `studio-hosted` job runs its hosted
  tests on every change to the Studio Server; its code counts in the coverage, with floors on its trust boundaries.
