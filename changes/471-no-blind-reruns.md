### Changes

- **The release command never re-runs a mutation verdict (next, #471)**: a mutation shard red on survivors that
  `docs/dev/mutants.json` does not name fails the same way on every try, yet `npm run release -- <x.y.z>` re-ran the
  candidate once anyway. 4.7.2's candidate 42527046788 spent 72 minutes failing the same six shards again, and the
  eleven survivors had to be dug out of the job logs. Such a shard now writes a `mutation verdict` annotation (a step
  of `candidate.yml` after the mutation step, from the shard's report – not `tools/mutate.ts`, whose change would
  throw away every cached shard), and the command stops at the first one, the run still going, never re-running the
  candidate, whatever else is red beside it. It lists each red shard and its survivors (`file:line operator: from →
  to`), the other red jobs, how to kill or name a survivor, and the command once the fix is merged
  (`--commit=<the fix's merge sha> --start-candidate`). The gate report says it first on the candidate's line, so
  `--dry-run` shows it before anything waits. A mutation job that died otherwise (cancelled, timed out, a runner lost)
  writes no verdict and keeps its one re-run.
