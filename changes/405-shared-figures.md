### Changes

- **Pull requests no longer rewrite figures every other pull request rewrites (4.6.0, #405)**: `npm run
  quality:baseline` now writes the behaviour only (the games' witnesses and proofs, the golden saves, the API's hash,
  and the README's reference-proof figure when it moves). The test counts, the first visit's JavaScript and the
  READMEs' other figures and install line are written by the release (`npm run quality:baseline -- --release --dist`,
  the `quality baseline` step of `npm run release -- prepare`, after a build). `--check` still fails on a behaviour
  change and on fewer test declarations; more tests and a first visit that moved are warnings, the first visit in
  bytes ("+200 bytes since the release"). The first visit is gated by each game's `assetBudgets.initialJsKB` only,
  compared in bytes (`initialJsKB` × 1024) instead of rounded to the KB: one byte over fails, wherever the rounding
  would have put it. The sample games' budgets keep a margin of about 2 KB, which each release resets on purpose: the
  demo stays at 140 (138.1 KB measured), the reference chapter goes from 143 to 145 (142.8 KB). The coverage floors
  move from `vite.config.ts` to `tests/coverage-floors.json`, which `vite.config.ts` reads and the mutation cache does
  not hash: raising a floor re-runs no mutation set. This change edits `vite.config.ts` once more, so every set's cache
  key moves this one time. Nothing changes for a player or an author whose game sits under its budget; a game whose
  first visit sat within 0.5 KB over its `initialJsKB` passed before and fails now.
