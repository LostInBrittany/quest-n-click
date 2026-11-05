### Changes

- **Reading the named survivors again no longer re-runs every mutation set (next, refs #410)**: the mutation cache's
  input hash reads `docs/dev/mutants.json` as the mutants its entries name (file, operator, from, to, context), not
  their why, category, proof, owner or revisit, which are still checked on every run, a reused report included.
  4.7.0's release pull request moved every entry's revisit one minor on, and the candidate measured all 20 shards again
  (about ten runner-hours, the warm-up's included) against code that had not moved. Every cache key changes once with
  this change; the next nightly refills them.
- **The mutation jobs start with the longest (next, refs #410)**: the matrix the candidate, the nightly and a `full-ci`
  pull request run is ordered by the minutes each shard takes cold (`tools/mutation-minutes.json`, from 4.7.0's first
  candidate, no input of any set's hash), so the 8 jobs run at a time end together: a cold candidate's mutation from 114 min to about 81.
  `npx tsx tools/mutation-shards.ts --minutes` rebuilds the table from a run's jobs.
- **`prepare` no longer starts the mutation cache's warm-up (next, refs #410)**: it took about 110 min and the release
  pull requests of 4.6.0 and 4.7.0 merged after 24 and 52, so the candidate measured the same long shards beside it
  (about 600 runner-minutes a release, 8 runners held). The candidate's own cache step restores and saves the same
  keys. The pull request's body gives the command for a review that will last longer:
  `gh workflow run nightly --repo <repository> --ref main -f jobs=mutation`.
- **`prepare` names the mutation exemptions due at the version before it pushes (next, refs #410)**: its stop already
  failed on them through `tests/mutants-json.test.ts` (#443), with only that test's FAIL line; it now lists each entry
  due, `checkKnown`'s rule, and the way on (read it again, keep it with a later revisit or remove it, then
  `npm run test:mutation:core -- --doc`). 4.7.0's 135 were found by the release pull request's ci instead.
- **A later candidate of a version cancels an earlier red one (next, refs #410)**: the candidate's new `supersede` job
  cancels a candidate on `main` started before it, of another SHA whose `package.json` names the same version, still
  running with a job already failed or timed out; never a green or still-green run, another version's or a pull
  request's. Its runners go to the new run (4.6.0's and 4.7.0's first candidates ran 72 and 105 min red). Each
  candidate's name now says the SHA it tests. The release command stops on a candidate cancelled after a red job
  instead of re-running it, with the `--commit … --start-candidate` line.
