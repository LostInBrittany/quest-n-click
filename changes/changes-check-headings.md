### Fixed

- **`npm run changes -- --check` refuses a fragment the release would stop on (4.5.5, #335)**: it only asked whether a
  branch that changes the code carries a fragment, so `### Fixes` (#328) passed its pull request and would have stopped
  4.5.5's `npm run release -- prepare` at the changelog step. It now reads every fragment in `changes/` as `--assemble`
  does, with the same three headings, and names each problem with its file and line: a heading other than
  `### Breaking`, `### Fixed` or `### Changes`, text before the first heading, a `.log.md` that does not open on
  `## <title>`. CI's `check` job already runs it on every pull request.
