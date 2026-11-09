### Changes

- **A smaller engine package (next, #514)**: `@quest-n-click/engine` no longer carries the repository's CI tools
  (test shards, mutation testing, the nightly report, the coverage ratchet, benches), 14 files that nothing in the
  package imported and some of which could not run from it. No `quest-n-click` command changes.
