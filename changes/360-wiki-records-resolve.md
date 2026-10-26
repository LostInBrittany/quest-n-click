### Changes

- **One command resolves a merge conflict on the wiki's translation pairs and claim reviews (4.5.5, #360)**: two pull
  requests that edit and record the same section stop git on `wiki/translations.json` (or `wiki/reviews.json`);
  `npm run wiki -- records --resolve --by <name>` now resolves it. It takes main's side in either merge direction (read
  from git's index: theirs when the commit merged in is in main, ours on main or when HEAD is in main, else
  `--main=ours|theirs`), keeps the records only the other side changed, keeps for a section both changed the record
  whose hashes are the current texts', and otherwise records it again as an AI (`--kind ai --relation author`), never
  as a person. It prints each person's review it could not keep, with the command to record it once read again, writes
  a clean file and stages nothing. `npm run wiki -- check` names the command when either file holds conflict markers.
