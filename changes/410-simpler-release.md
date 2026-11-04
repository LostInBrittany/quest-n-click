### Changes

- **The release commands go on through a passing failure and say the way on (4.6.1, #410)**: what stopped or misled
  4.6.0's release, each fixed in the command. Git's network steps (`git fetch` in `prepare` and in
  `npm run release -- <v>`, `ship tag`'s fetches and tag push) are tried four times, 15 s apart, before stopping. A
  release run where no job ran (run 41819835975: its `release` job never created) is re-run whole
  (`gh run rerun <id>`), `--failed` only when a job failed. A candidate red twice names
  `npm run release -- <v> --commit=<the fix's merge sha> --start-candidate` for a fix merged on main. On `release/<v>`
  the refusal gives `git switch main && git pull --ff-only <remote> main`, and `prepare` ends by saying it.
- **`prepare` updates what follows from the version (4.6.1, #410)**: the versioned locks' engine peer
  (`scripts/locks/quest-n-click-studio-server.json`, `"@quest-n-click/engine": "N.M.x"`) follows a new minor, that
  field only; an upgrade-notes section written ahead (`from-<prev>-to-<v>`) is kept, the CHANGELOG bullets in a comment
  at its end, no `TODO(release)` added, and a lead that names the version is left alone.
