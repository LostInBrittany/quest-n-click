## the release command looks for its commit on main's first parents

4.5.4's `npm run release -- 4.5.4` stopped at once: "no candidate of 1d3d98c on main". `findReleaseCommit` walked
`git log -- package.json` on `upstream/main`, which goes down the merged release branch too: its newest 4.5.4 commit
before a 4.5.3 one was the `prepare` commit (`1d3d98c`), not the merge of #322 (`47dccf1b`) that the release-merge
candidate ran on. `--first-parent` keeps the walk on main's own line, where the merge is the commit that turned
`package.json` into the version. A test pins the call (the walk's git call is not otherwise unit-tested).

→ next: 4.5.4's release, then 4.5.5.
