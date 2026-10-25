## the nightly fills the mutation cache the candidate reads

The 4.5.4 candidate (run 40224466138) ran 18 mutation shards of 9 to 46 min at 8 at a time (#302): they started from
19:09 to 19:55, past the hour, everything else done by 19:36. The shards already sat behind `actions/cache`, keyed
`mutation-<shard>-<set's input hash>`, but every gated set changed hash between the morning's candidate (b061c4ae)
and the release's (47dccf1b): `vite.config.ts` (070a3cd9) and the lockfile (a Dependabot merge, 0c872cc0) are inputs of
every set. The release commit itself keeps every hash (its `package.json` and lockfile changes are the version fields
the hash leaves out). And the nightly measured exactly these shards on `main` every morning, `--fresh`, and kept
nothing.

Now the nightly's `mutation` job reads the hash before any mutant (the candidate's step) and, after the run, saves the
shard's report with `actions/cache/save` under the candidate's key: a gated shard, passed only (the step's implicit
`success()`; `reusableReport` refuses a failed report anyway), never on a warm-up's hit. Checked before writing it:
caches are scoped by ref, the nightly and the candidate both run on `refs/heads/main` (and a `full-ci` pull request's
candidate reads the default branch's); reuse is whole-shard (`inputHash`, the shard's input hash, `passed`) and the
merge accepts shards of one input measured on several commits (4.1.8); same matrix names, same path (so the same
cache version); keys are immutable, so a key already saved is a warning, its entry a passed report of the same inputs;
no `restore-keys`, a report of other inputs is never reused. Entries are 2 to 13 KB; the repository is over its 10 GB
(npm caches of pull requests), so the least recently used go first, and a night's entry read the same day is among
the newest. The night stays `--fresh` (4.1.8: under load a timeout counts as a kill). `-f jobs=mutation` (a choice,
`all` by default) runs the mutation jobs only, every other job's `if` false, and reuses what the cache holds: a warm-up
after a release's last merge, when a change shared by every set moved them all. The nightly's matrix at 8 at a time,
so a warm-up by day leaves the runners to pull requests. Not a reusable workflow for the three mutation jobs:
`tests/release-candidate.test.ts` and the candidate's gate read them by name in each workflow. Two tests pin the key
shared with the candidate, the save's conditions and the warm-up's guards. The CI, mutation and releasing pages (en,
fr) say it.

→ next: the 4.5.5 candidate's mutation jobs, hits for the sets the night measured; a red night's shard is not saved.
