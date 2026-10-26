### Fixed

- **`npm run wiki -- check` reads a page with CRLF line ends as the same page with LF (4.5.6, #367)**: on a page saved
  with CRLF (a Windows editor, or a copy of the wiki without the repository's `.gitattributes`), a code fence never
  opened (a regex's `.` stops at `\r`), so every link written inside a code block was checked as a real link and
  reported as an error. The page parser now reads `\r\n` as `\n`. A change to the wiki's own tools or to a
  `tests/wiki-*.test.ts` now also runs the CI's `windows` job, where #363's tests had failed, first seen on the release
  pull request.
