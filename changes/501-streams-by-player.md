### Fixed

- **The Bridge's open streams are indexed by player (next, #501)**: the pass every 5 s that covers a lost wake-up, and
  each wake-up, scanned every open stream of the instance once per player: about 580 ms of blocked event loop per pass
  at 10 000 streams, the default `streamsPerInstance`. A wake-up, the per-player limit check and the revocation of a
  player now read only that player's streams (about 6 ms for the same pass). Nothing changes in what a stream receives.
