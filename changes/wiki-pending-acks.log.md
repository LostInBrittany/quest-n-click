## Pending acks: a branch never writes translations.json, the release folds

Every merge since 20 Oct whose two sides changed `wiki/translations.json`, replayed with `git merge-file`: 7 conflicted
(#352's and #357's branches on 25 Oct among them), 23 hunks, each the same key recorded on both sides; neighbouring keys
always merged cleanly. One file per record (#361, ~2,960 files) and a resolving command (#362) were set aside for the
#312 pattern: a branch no longer writes the shared file. Rulings: the pending file is `changes/<slug>.acks.json`, one per
branch, holding pairs and claims, `<slug>` the branch without its prefix as the fragments say (`docs/<v>` gives
`<v>`); `main`, `master` and `release/*` write the two files (the release folds there, and no pull request writes them
any more, so its acks there conflict with nothing); a detached HEAD is refused without `--pending`; outside a git
repository, the two files. Readers: per section or claim, every record (the file's, then the pending files in name
order) holding the current hashes wins, reviewers merged by name (the later date kept, never upgraded to a person);
none holding, the file's record (else the latest pending) says what changed. Fold: a section's holding records become
the file's record; one none holds keeps the file's record; a pending record holding nothing is dropped and printed,
its reviewers named, with its re-ack command; a person's review on the file's record that a newer pending one replaces
is printed too; records of a section or claim gone are removed (their warnings became gaps: a branch can no longer
remove them). `prepare` runs it as `wiki acks` after the changelog and keeps its ⚠ lines in
`.cache/release/<v>.acks-folded.txt` for the stop before the push (alone they stop nothing: a section that still
matters is a pair to review, which the gates fail). The doc revision's source-set rule accepts `changes/*.acks.json`.
`tests/wiki-pending.test.ts`: two branches ack the same section, neighbouring sections, an unchanged section, a person
and a claim; merged into each other and into main in both orders with no conflict, the same states; then the fold
(4 pairs kept, the rest listed, the replaced person named, no person invented, the check clean). This branch's own acks
are its pending file. AGENTS.md says nothing of acks; CONTRIBUTING and the PR template neither.

→ next: 4.5.5's prepare folds the pending files of the branches merged by then, this one's included.
