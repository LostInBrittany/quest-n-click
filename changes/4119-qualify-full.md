### Changes

- **The Bridge's qualification profile covers the leaderboard too** (4.1.19, `npm run ops:qualify`, `ops/qualify/`). It
  now checks, in the HTTPS, three-instance, Postgres topology:
  - Daily and Mystery across instances;
  - a run verified by the speedrun worker, its duplicate refused, and moderation by a token file;
  - an instance killed while its worker verifies, with the run taken by another instance and verified once;
  - one submission quota shared by the three instances;
  - the board after 20 000 runs;
  - a schema 3 backup with runs and daily records, restored after the topology and its database are destroyed;
  - a store made by the published 4.1.17 Bridge, read by this one.
