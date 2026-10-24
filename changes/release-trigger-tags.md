### Fixed

- **No more skipped release runs** (4.5.3): `release.yml` starts only after a `ci` run of a `v*` tag, instead of after every `ci` run of `main` and of each pull request, which each left a skipped run in the Actions list.
