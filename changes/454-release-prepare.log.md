## The release pull request by one command (part B of "Simple release")

4.5.3's release commit (2afb9f51, 108 files) was written by an agent, by hand around the existing tools. `tools/release/prepare.ts`
runs those tools in its order and writes the rest from helpers checked against that commit (the passes sheet and
`passIssues`, the CHANGELOG heading and intro, the LOG's release entry, the upgrade notes' section and lead, the README's
line, the releases' history kept under "Over …"). Run end to end on a throwaway clone (`prepare 4.5.4 --name="Simple
release" --no-pr`): 84 files, then `check 4.5.4` listed the 16 `TODO(release)` and the pairs to record; that run found
two defects the unit tests then pinned (the README's history wiped, the CHANGELOG's blank line eaten). `changes --assemble`
now makes `## Unreleased` and folds a lone `.log.md`. The golden-save list moved to `tests/fixtures/saves/index.json`:
`tests/save-v3.test.ts` changes once more here, so its four claims need a person's `review-claim` again, then never at a
release. The scripts page gives `npm run release` the anchor `script-release` (the group keeps `release`).
Plan: docs/dev/plans/4.5.4-b-release-prepare.md.

→ next: part C and E (the candidate on the release PR's merge, the docs' human gates in the PR's CI, docs-publish
without a click), then D (`npm run release -- <version>`).
