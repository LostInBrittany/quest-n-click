### Fixed

- **`npm run release -- <version> --commit=<sha>` releases on a later commit of main than the release merge (4.5.6,
  #369)**: when main's `ci` is red on the release pull request's merge for a reason fixed only after it, as on 4.5.5
  (its `windows` job, fixed by #368), the release could never be tagged, since `release.yml` wants main's `ci` green on
  the tagged commit. The given commit stands for the release commit everywhere (the docs' gates, the candidate,
  `ship tag`, the release run); it is refused, with what to do, when it is not on main's first-parent line, not at the
  version, not the release merge or after it, or when the tag is already out on another commit. Without the flag,
  nothing changes.
