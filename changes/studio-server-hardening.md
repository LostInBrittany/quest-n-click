### Fixed

- **The back-channel logout reads no more of a body than it takes (next)**: a form over its 16 KiB limit, or announced
  as such by its length, is answered 413 and the rest of it drained, not kept in memory, as the API's JSON bodies
  already were. Its limit is counted in bytes.
- **An agent's whole-file write no longer overwrites a teammate's edit (next)**: `set_storyboard` and `set_layout`,
  over the remote MCP or the local MCP pointed at a hosted Studio, send the revision the agent read the file at. A file
  someone else wrote since is refused (409), and the agent reads it again, instead of the teammate's change being
  silently replaced.
- **A session checked by two requests or two instances at once is refreshed once (next)**: the check is claimed in the
  database, so a provider that rotates refresh tokens and detects their reuse no longer ends a member's session during
  a deploy's overlap or a burst of requests. A refusal of a token another instance has rotated since ends nothing.
- **`gc --delete` keeps a blob stored again while it runs (next)**: each blob's date is read again right before its
  deletion, and one written within the grace period since the listing stays.
- **A git push or import reads the game's blobs several at a time (next)**: one request per file instead of two, eight
  at a time, as a build stores its files.
