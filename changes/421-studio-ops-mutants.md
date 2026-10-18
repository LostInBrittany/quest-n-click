### Changes

- **The Studio Server's journal is held by mutation testing** (4.2.1): the set `studio-ops` (the journal, its durable
  writes, the spans) is gated, every surviving mutant killed by a test or named.
