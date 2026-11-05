### Fixed

- **A download from GitHub's releases says each failed try, and tries for about three minutes (4.7.1, refs #410)**:
  the 4.7.0 candidate's external-consumer met five 504s in a minute on the older engine's download and stopped without
  a line; its re-run passed. Seven tries now, 5 s doubled up to a minute between them, each said; a 404 still fails at
  once. `upgrade-check` takes the older engine the same way (a single `gh release download` before), and so does
  `ops-qualify`'s 4.1.17 Bridge.
- **The wiki's clone, and a push that never reached the wiki, are tried again (4.7.1, refs #410)**: 4.7.0's
  `docs-publish` failed on one "Permission denied (publickey)" at the clone, with a key that worked on its re-run. Four
  tries, 15 s apart, as the release command's Git steps; a push the wiki refused (moved since the clone, a protected
  branch, a key without write access) still fails at once.

### Changes

- **The releasing page says what 4.7.0's release tools do (4.7.1, refs #410)**: the re-run when no job ran, the way on
  from a red candidate (`--commit=<sha> --start-candidate`), the way back to `main` after `prepare`, Git's steps tried
  again, the locks' peers and an upgrade-notes section written ahead.
- **A flaky reality-cursor test no longer races a timer (4.7.1, refs #410)**: "SSE, two signals not settled, the first
  acknowledged from outside the loop" waits for the acknowledgement itself, so a loaded runner no longer sees `s1`
  twice.
