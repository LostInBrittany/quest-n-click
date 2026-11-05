### Release

A branch names the release it lands in `next` and the release writes the number, and `release -- check` runs the
tests the version moves before the release pull request does, for maintainers and contributors.

### Release (fr)

Une branche nomme `next` la release où elle arrivera et la release en écrit le numéro, et `release -- check` lance les
tests que la version fait bouger avant la pull request de release, pour les mainteneurs et les contributeurs.

### Changes

- **Fragments, the wiki and comments name the next release `next`, not a guessed number (next, #443)**: a fragment
  writes `(next, #n)`; `npm run changes -- --assemble --version=<v>`, which `prepare` runs, writes the version in its
  place, and `changes -- --check` refuses a version after `package.json`'s. The wiki's prose (`(next)`), a section's
  `<!-- applies: next.. since next -->`, the manifest's `"appliesFrom": "next"` and a comment in the code roots or
  `tests/` use the same mark, rewritten by `prepare`'s new step `next mark` (`tools/next-mark.ts`), which carries the
  translation pairs and claim reviews recorded before over to the rewritten text: nothing is left to review. Never
  rewritten: a code span, code outside a comment, a string, a game folder, a historical file.
- **`release -- check` runs the tests that depend on the version (next, #443)**: `tests/mutants-json.test.ts`,
  `tests/quality-baseline.test.ts`, `tests/readme-truth.test.ts` and `tests/readme-release.test.ts`, under a second;
  `prepare` runs them in its stop before the push, so a release its pull request's CI would refuse (4.7.0's
  `mutants.json` entries due, its first visit typed in a test) stops on the maintainer's machine. Nothing is added to
  pull requests' CI.
