## #410 PR 4: 4.6.0's and 4.7.0's release days measured, the mutation cache kept across a reread of the survivors

R6 of the plan ("long CI waits between each step"), measured before anything is changed: every run of 4 and 5
November from the Actions API, job by job and attempt by attempt, and the mutation jobs' logs. The timelines, the
findings and the proposals are in `docs/dev/PLAN-4.6.x-RELEASE-IN-THREE-COMMANDS.md`, PR 4.

- Both days took about 3 h 35 min from `prepare` to npm. The candidate is the path; main's ci on the merge and qualify
  end long before it. A warm candidate takes 20 to 25 min, a cold one about two hours, nearly all of it mutation.
- 4.7.0's warm-up served nothing: `docs/dev/mutants.json` is an input of every set's hash, and the release pull
  request's reread moved only the revisits (the one input that differed for each of the 14 sets, compared on both
  trees). Implemented: the hash reads the mutants the entries name, nothing else; `checkKnown` still checks the rest
  on every run and `mutation-merge` judges by the same fields, so no check is lost. With it, 18 of 4.7.0's 20 shards
  could have been reused.
- The warm-up never finished in time (about 110 min against a release pull request open 24 and 52 min): the long
  shards on the candidate's path were measured twice, `studio-workshop` three times in 4.6.0. Proposed, then approved
  by the maintainer and implemented, one commit each: the matrix longest first from a table of each shard's cold
  minutes (`MINUTES`, rebuilt by `mutation-shards.ts --minutes`; 117 to 81 min modelled); no warm-up started by
  `prepare` (the by-hand command in the pull request's body for a long review); the exemptions due named in
  `prepare`'s stop before the push (the rule was already there through #443's version tests, only the FAIL line was
  said); a candidate's `supersede` job that cancels an earlier, still running red candidate of the same version and
  another SHA on `main`, each run now named `candidate <sha>`, and the release command stopping on such a run rather
  than re-running it.
- qualify on the release pull request stays: the release commit changes what it packs, and it caught R4 on 4.6.0.
- Not verified on GitHub: the hash change is proved by its tests and by replaying `inputFiles` on the 4.7.0 trees; the
  order by the model on 4.7.0's durations; `supersede` by its pure decision's tests and the workflow's pinned shape,
  never by a run that cancels another.

→ next: the first nightly after the merge refills every key (they all change once); the first release after it shows
whether the order and the cache hold.
