### Changes

- **Reading the named survivors again no longer re-runs every mutation set (next, refs #410)**: the mutation cache's
  input hash reads `docs/dev/mutants.json` as the mutants its entries name (file, operator, from, to, context), not
  their why, category, proof, owner or revisit, which are still checked on every run, a reused report included.
  4.7.0's release pull request moved every entry's revisit one minor on, and the candidate measured all 20 shards again
  (about ten runner-hours, the warm-up's included) against code that had not moved. Every cache key changes once with
  this change; the next nightly refills them.
