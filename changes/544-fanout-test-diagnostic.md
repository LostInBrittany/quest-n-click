### Fixed

- **The SQLite fan-out test no longer times out on a slow CI runner (next, #544)**: it timed out twice in one day while
  its signals were only late, not lost (SQLite on the runner 100 to 300 times slower than on a laptop; 1 050 runs under
  delays and CPU load lost none). It now has 30 s for a 10 s wait, and a failure says when each sequence arrived, how
  many the store holds and what B logged, so a late runner reads apart from a lost wake-up. Nothing changes for a host.
