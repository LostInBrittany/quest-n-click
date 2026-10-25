## The wiki's review records, one file each: no more conflicts on translations.json

Every merge since 20 Oct whose two sides changed `wiki/translations.json` was replayed with `git merge-file`: 7
conflicted (#352's and #357's branches tonight, #344's, three others), 23 hunks, and every hunk was the same key acked
on both sides (the same section edited by both pull requests); none was two neighbouring keys, which already merged
cleanly (the file was sorted, one key per line). So neither tighter formatting nor one file per page could help, and
a merge driver is not seen by GitHub, CI or contributors. A record is now a file named by its key and the first 8 hex of
its two hashes; two acks of one section are two files. Rulings: an ack never deletes (a re-ack is up to 46% similar to
the record it replaces, measured, near git's 50% rename threshold, and a rename/rename is a conflict again), so the
superseded records stay until `records --prune`, deletions only, which `release -- prepare` runs as its step `wiki
records`; they are a gap of `check`, not a warning (prepare wants 0 warnings). Records of a section or claim gone,
warnings until now, are part of the same gap. The old files are refused by `check`, `--ack` and `review-claim` with the
command that migrates; `records --migrate` merges a record of the same texts (the folder's reviewers kept, the file's
added) and can run again after merging a branch that still has the old file. The migration was compared record by
record: 2,861 pairs and 102 reviews before and after, the same keys, byte-identical records, 2,616 and 101 human
reviewers kept. `tests/wiki-records.test.ts` merges, with plain `git merge`, two branches acking neighbouring pages,
neighbouring sections and the same section twice (and a claim reviewed on both after its test file changed on both):
clean, the check passes and names the one section to read again; after the ack and the prune, every pair is paired.
The writing-docs and governance pages (en, fr) say it.

→ next: once #352, #357 and #358 are merged, main merged in here and `records --migrate` run on its translations.json.
