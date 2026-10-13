### Changes

- **Every surviving mutant of badge verification read** (4.1.20): the 197 survivors of `connectors-edge` in
  `connectors/src/badges/verify.ts` (168) and `connector.ts` (29) were read one by one. 193 are killed by
  `tests/connectors-badges-edge-mutants.test.ts`, which checks each refusal's exact reason, the exact bounds of dates,
  counts, indexes and the cache, each shape a document may take, and what the badge form answers and rejects. The
  other 4 are named as equivalent in `docs/dev/mutants.json`: two key lookups whose forced branch gives the same null,
  and two fetcher options passed as `undefined`, which the fetcher reads the same as absent.
