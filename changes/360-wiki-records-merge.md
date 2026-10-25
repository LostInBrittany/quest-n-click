### Fixed

- **Two pull requests that edit the same wiki section no longer conflict on its translation record (4.5.5, #360)**:
  `wiki/translations.json` and `wiki/reviews.json` become one file per record, `wiki/translations/<page>/<section>.<en8>.<fr8>.json`
  and `wiki/reviews/<claim>.<text8>.<test8>.json`, named by the hashes they record. `translations --ack` and
  `review-claim` only add a file (or a reviewer to the record of the same texts), so two branches that ack the same
  section write two files and git merges them cleanly; the check judges a section by its record of the current texts,
  and says it is to review when the merged text is a third one. `npm run wiki -- records --prune` removes the superseded
  records (the release's `prepare` runs it); while an old single file is present, the check fails and
  `npm run wiki -- records --migrate` folds it in (re-runnable, nothing lost). A branch opened before this change that
  touched `wiki/translations.json` gets one last conflict on it: keep the file, run `records --migrate`, commit.
