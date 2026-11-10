### Changes

- **The mutation jobs are written once (next, #525)**: ci, the candidate and the nightly each call
  `.github/workflows/mutation-run.yml` from one job named `mutation`, instead of three copies of the plan, the shards
  and the merge. Their checks now read `mutation / plan`, `mutation / mutation (<set>-<i>of<n>)` and
  `mutation / merge`; `pr-gate`, `candidate-gate` and the nightly's `report` need the one `mutation` job, red when the
  plan, a shard or the merge is. The safeguards are the same: a shard missing or doubled is refused at the merge, the
  candidate's shards say their verdict for the release command, and the nightly saves under the keys the candidate
  restores. The list of sets measured every night without gating (`MEASURED`), empty since 4.7.0, is gone with
  `--matrix=nightly`; a new set is measured by hand (`gh workflow run mutation -f set=…`) until it is read and gated.
  Editing `tools/mutation-sets.ts` and `tools/mutation-shards.ts`, two inputs of every set's hash, makes the first
  candidate after the merge run every shard cold, unless a nightly or a warm-up ran in between.
