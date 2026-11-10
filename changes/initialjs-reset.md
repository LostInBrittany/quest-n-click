### Changes

- **The release resets the first-visit budget (next)**: `npm run release -- prepare`'s `quality baseline` step now
  writes the measured game's `assetBudgets.initialJsKB` back to the first visit it just measured plus 2 KB, rounded up
  to the KB – down too when the visit shrank – and prints the old and the new budget for the release pull request. The
  policy was written in the demo's comment but never automated: the demo's margin had shrunk to 221 bytes. A game that
  sets no budget is left alone, and a budget it cannot rewrite in place stops the step. The reference chapter, which
  `prepare` does not measure, is set by hand to 147 for 148 056 bytes measured.
