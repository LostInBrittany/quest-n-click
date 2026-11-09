### Fixed

- **Two CLI runs asking for a Studio token at once no longer crash (next, #512)**: when one `studio-server token` or
  `login` released the token file's lock just as another found it taken, the second failed with
  `TypeError: Cannot read properties of undefined (reading 'mtimeMs')`. It now takes the free lock on its next try.
