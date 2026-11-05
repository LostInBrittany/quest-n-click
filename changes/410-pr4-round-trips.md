### Changes

- **Reading the named survivors again no longer re-runs every mutation set (next, refs #410)**: the mutation cache's
  input hash reads `docs/dev/mutants.json` as the mutants its entries name (file, operator, from, to, context), not
  their why, category, proof, owner or revisit, which are still checked on every run, a reused report included.
  4.7.0's release pull request moved every entry's revisit one minor on, and the candidate measured all 20 shards again
  (about ten runner-hours, the warm-up's included) against code that had not moved. Every cache key changes once with
  this change; the next nightly refills them.
- **The mutation jobs start with the longest (next, refs #410)**: the matrix the candidate, the nightly and a `full-ci`
  pull request run is ordered by the minutes each shard takes cold (`MINUTES` in `tools/mutation-sets.ts`, from 4.7.0's
  first candidate), so the 8 jobs run at a time end together: a cold candidate's mutation from 114 min to about 81.
  `npx tsx tools/mutation-shards.ts --minutes` rebuilds the table from a run's jobs.
