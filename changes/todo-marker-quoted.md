### Fixed

- **A `TODO(release)` quoted as code is not a marker left (4.5.5, #364)**: `prepare`'s stop before the push and
  `npm run release -- check` counted every line holding the text, so a CHANGELOG bullet about the markers, copied
  whole into the upgrade notes, was a marker no one could ever write, and 4.5.5's release could not pass (found by a
  rehearsal). An occurrence in backticks or a fenced block is now a quotation; every marker `prepare` writes is bare
  prose and still counts. `npm run changes -- --check` refuses a fragment with a bare `TODO(release)`, which would
  land in the CHANGELOG or the LOG the same way, and the LOG title that had one now quotes it.
