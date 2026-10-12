### Changes

- **The Postgres adapter's mutation set gates, judged on a real Postgres** (4.1.20): `reality-store-postgres` joins the
  gated sets, with 40 of its 41 mutants killed and the last named as equivalent. Its tests each get a database of their
  own and run one file after the other. CI's `bridge-postgres` job runs the set's eight files, not five.
- **Mutation in shards, from one matrix** (4.1.20): a long set runs in shards (`--shard=i/n`), which are then merged
  into the set's report (`--merge`). The merge refuses a shard that is missing, doubled, cancelled or of other inputs.
  ci, the nightly, the candidate and the release run the matrix that `tools/mutation-shards.ts` generates, and no
  workflow writes its own list of sets. `release.yml` refuses a tag whose commit generates none.
- **Every named survivor is an exemption with its terms** (4.1.20): each entry of `docs/dev/mutants.json` says its
  category, why, proof, owner and the version it is read again at. An incomplete entry or a version that has come
  fails the run.
- **A mutation run that cannot start says why** (4.1.20): it names each failed test and its first error.
