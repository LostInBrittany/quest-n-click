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
  shards on the candidate's path were measured twice, `studio-workshop` three times in 4.6.0. Proposed, not
  implemented (they change what the release starts or waits for, or move a check): the matrix longest first (a cold
  mutation phase from 117 to 81 min, modelled), no warm-up dispatched by `prepare`, the revisits checked by `prepare`
  before its push, a red candidate cancelled when a later one starts.
- qualify on the release pull request stays: the release commit changes what it packs, and it caught R4 on 4.6.0.
- Not verified here: no workflow changed; the hash change is proved by its tests and by replaying `inputFiles` on the
  4.7.0 trees, not by a candidate run.

→ next: the maintainer's choice among proposals b to e; the first nightly after the merge refills every key.
