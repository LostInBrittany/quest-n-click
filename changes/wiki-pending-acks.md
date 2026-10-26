### Changes

- **A branch records its translation acks and claim reviews in its own pending file: two pull requests no longer
  conflict on `wiki/translations.json` (4.5.5, #360)**: on an open branch, `npm run wiki -- translations --ack` and
  `review-claim` write `changes/<slug>.acks.json` (the branch without its prefix, as for the fragments) instead of
  `wiki/translations.json` and `wiki/reviews.json`, which only `main`, `master` and a `release/*` branch write. Every
  reader (`wiki -- check`, `--publish`, the release's gates, `candidate`, `docs-publish`, the page headers) sees the
  two files plus the pending ones: the records of the current text win, their reviewers merged. The release's
  `prepare` folds them in a new step, `wiki acks` (`npm run wiki -- acks --fold`): what still holds goes into the two
  files, the pending files are deleted, and what no longer holds is listed with its reviewers and the command to record
  it again, and repeated in prepare's stop. A doc revision's reviews on `docs/<v>` land in `changes/<v>.acks.json`,
  which its publication accepts as documentation. A detached HEAD needs `--pending <slug>`. Records of a section or
  claim gone are no longer warnings: the fold removes them.
