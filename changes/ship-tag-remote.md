### Fixed

- **`ship tag` tags the organisation's repository and checks the CHANGELOG first** (4.5.3): it fetches from and pushes to the git remote whose URL is `Quest-n-Click/quest-n-click` (`upstream` when `origin` is a fork), instead of `origin` always; and it refuses, before creating anything, a commit whose `CHANGELOG.md` has no section of the version, which release.yml needs for the notes (`v4.5.3-rc.1` was spent that way).
