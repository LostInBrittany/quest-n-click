# Fragments of the CHANGELOG and of the LOG

A branch that changes the code does not edit `CHANGELOG.md` nor `docs/dev/LOG.md`: it writes its fragment here, and
`npm run changes -- --assemble` folds every fragment into the CHANGELOG's `Unreleased` and the LOG, in the order the
fragments reached `main`, at the release (or whenever). Two open branches never conflict on those two files again.

- `changes/<slug>.md`: the CHANGELOG bullets, under `### Breaking`, `### Fixed` or `### Changes` (any of them, in any
  order; the assembly puts each under its section). Write them as the CHANGELOG does: a bold lead, the version in
  parentheses, what a player, an author or a host sees differently.
- In the same file, optionally, `### Release` (next, #410): one or two sentences for the release's intro, what the
  change brings and for whom, prose that reads well joined to the other fragments'. `npm run release -- prepare` joins
  every fragment's, in the assembly's order, into the CHANGELOG's intro and the README's current-release line instead of
  a `TODO(release)`. `### Release (fr)` translates it for `README.fr.md`; the French line is written only when every
  fragment with a `### Release` has its `(fr)`. A fragment without one adds nothing to the intro: a CI fix needs none.
  Refused: empty, a list, over 400 characters, no full stop at the end, twice, or `(fr)` without the English one.
- The release a fragment lands in is `next`, never a guessed number (next, #443): `(next, #417)` in a bullet's
  parenthesis. `npm run changes -- --assemble --version=<x.y.z>`, as `prepare` runs it, writes the version in its
  place; `--check` refuses a version after `package.json`'s. The wiki's prose, its `applies` markers, the manifest and
  the code's comments use the same mark, which `prepare` rewrites (`tools/next-mark.ts`, contribute.conventions).
- `changes/<slug>.log.md` (optional): the LOG entry. First line `## <title>` (what follows `#n · date · Claude ·
  proposal ·` in the LOG), then the body, its `→ next:` line last. The number and the date are the assembly's.
- `<slug>` is the branch without its prefix, e.g. `419-cadence`. A fragment's date is its first commit's (a rebase
  moves it); a heading other than the three and the two release ones, or text before the first heading, is refused,
  nothing is filed silently.

`npm run changes -- --check` (CI's `check` job, on pull requests) fails a branch that touches `src/`, `bridge/`,
`tools/`, `scripts/`, `cli/`, `connectors/` or `games/` without a fragment and without a CHANGELOG edit (a release
branch edits the CHANGELOG directly), and refuses any fragment here that `--assemble` would stop on, with its file
and line (4.5.5, #335). This file is not a fragment.

`changes/<slug>.acks.json` is not a fragment either: the branch's pending translation acks and claim reviews, written by
`npm run wiki -- translations --ack` and `review-claim` instead of `wiki/translations.json` and `wiki/reviews.json`, so
two open branches never conflict on those two files (4.5.5, #360). Commit it with the branch; the release's `prepare`
folds it (`npm run wiki -- acks --fold`) as it folds the fragments.
