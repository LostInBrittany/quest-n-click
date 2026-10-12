## 4.1.20 PR 2a: the Postgres set gated, mutation in shards from one matrix, exemptions with their terms

- Plan §7.2–7.4 and §1.1 point 11. The nightly of 12 October could not measure `reality-store-postgres`. Reproduced on
  a local Postgres 15, the cause was in the tests:
  - every file shared one database: the leaderboard read the rows of earlier tests, and a worker of
    bridge-runs-durable claimed bridge-admission's queued runs, since a claim without a tenant takes any tenant's run;
  - the files ran side by side, beyond the server's hundred connections;
  - CI ran five of the eight files from its own list.

  Now each file has a database of its own (`tests/fixtures/pg-database.ts`), the files run one after another (`SERIAL`),
  CI reads the list from `tools/mutation-sets.ts`, and tests/bridge-postgres-isolation.test.ts keeps all three. A run
  that cannot start names its failed tests (`failureSummary`).
- The set's 41 mutants were read:
  - isolation alone took the kills from 15 to 23;
  - tests/reality-store-postgres-mutants.test.ts uses a fake `pg` and fake timers to kill 17 more: the retry on a
    transient conflict only, six attempts at most, a back-off of at least 5 ms, the advisory lock only when named, a
    failed ROLLBACK released with an Error, a notification without a player waking nobody, a replaced listener's error,
    listening again once, and a closed store staying closed when its connection lands late;
  - one mutant is named as equivalent: `clearTimeout(undefined)` does nothing.

  Measured locally: 40/41, 0 unexplained. The set is gated.
- Shards:
  - `--shard=i/n` cuts a set by whole files, largest first, each to the least loaded shard;
  - `--merge` refuses a shard that is missing, doubled, cancelled, of other inputs, of another cut, set or commit;
  - seen live: a shard measured while its inputs changed was refused;
  - `SHARDS`: connectors-edge 4, reality 2.
- One matrix:
  - ci, candidate, nightly and release each run `mutation-plan` (`tools/mutation-shards.ts --matrix`), `mutation`
    (one job per shard, Postgres for the set that needs it) and `mutation-merge`;
  - the nightly's measured set gates nothing;
  - `release.yml` judges a tag on its own commit's matrix and refuses a commit that generates none (no tag older than
    4.1.20 is released again);
  - the gate and the release wait for the merge;
  - the baseline and the summary read the merged reports only.
- Exemptions: `category`, `why`, `proof` (`argument` for an equivalent, else a test that exists), `owner` and `revisit`,
  checked at every run (`checkKnown`). The 93 entries were migrated (revisit 4.3.0, after 4.2). A revisit compares
  version cores, so a 4.2.0-rc already counts as 4.2.0.
- Learned: a mutation run edits the sources in place. Nothing is committed in a worktree while one runs there.

→ next: Claude · PR 2b–2d (connectors-edge by family), then 2e; PR 1b (backup 4) after 1a and 2a
