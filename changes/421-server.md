### Changes

- **`studio-server`, the Studio as a server** (4.2.1, first part; authentication comes next and it serves the loopback
  only until then). `studio-server serve --config <file>` serves the Studio's API under `/api/`, with:
  - the journal's cursor (`/api/revision`, `/api/ops?epoch&after`);
  - the probes `/livez`, `/startz` (started) and `/readyz` (serving writes);
  - a service lease so that one instance serves the writes;
  - operation ids from the client (`x-studio-op`): a retry gets the same answer and is applied once.

  Other commands:
  - `studio-server import <dir>` makes a game the instance's project;
  - `studio-server export <dir>` writes the game at its head with a manifest of hashes.

  On Postgres and an S3 store (Cellar), the database and the blobs are the truth and the instance's folder is rebuilt
  at start and checked every 30 s.
