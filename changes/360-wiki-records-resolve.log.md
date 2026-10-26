## records --resolve: a conflict on translations.json, resolved in one command

Every merge since 20 Oct whose two sides changed `wiki/translations.json`, replayed with `git merge-file`: 7 conflicted
(#352's and #357's branches on 25 Oct among them), 23 hunks, each the same key recorded on both sides; neighbouring keys
always merged cleanly. One file per record (#361) made those merges clean but cost ~2,960 files and was closed; the
single files stay, and the resolution, mechanical since the merged text is usually a third one, becomes a command.
Rulings: the three versions come from the index stages, never from the markers. Replayed in the test, git merges the
branch's new hashes of a record cleanly and stops on its reviewers only, so a side rebuilt from the markers, or picked by
hand, puts main's human reviewer on the branch's text; a file staged with its markers is refused, with `git checkout -m`
to bring the stages back. Main's side: theirs if MERGE_HEAD is in upstream/main, origin/main or main; ours on
main/master, if HEAD is in main, or during a rebase; else `--main`. Per key: one side changed it, that side's; both, the
record matching the current texts (main's first), else an AI re-ack by `--by`; a person's review on either side and
not in the result is printed with its re-ack command. It refuses while a page or test is still unmerged (its hash would
be its markers'), and stages nothing. `wiki -- check` prints the hint on markers in either file. `tests/wiki-resolve.test.ts`
builds the replayed shapes (the same section acked on both sides, neighbouring sections each on one side, a person's
review on main of a section the branch edited, a claim reviewed on both after both edited its test) and merges main into
the branch and the branch into main: the same files, the check passes, the lost review printed, no person invented,
nothing staged. AGENTS.md is the game author's guide (the Studio's Assistant loads it), so the agent's line went to
`contribute.ai-agents`'s common errors; `contribute.writing-docs` (en, fr) explains the command.

→ next: the next conflict on these files is resolved with it.
