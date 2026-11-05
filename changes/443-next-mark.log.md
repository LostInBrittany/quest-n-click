## #443: fragments name `next`, and `release -- check` runs the tests the version moves

4.7.0's release was slow twice over (#442). Every fragment since 4.6.0 named "4.6.1"; the release was a minor, and
#434 renamed about 80 marks by hand in fragments, comments and the wiki's "since" marks. Then `release -- check`
passed and the release pull request went red: `mutants-json` (135 entries due at 4.7.0) and `quality-baseline` (4.6.0's
first visit typed in the test) fail only once `package.json` names the version.

The mark is `next` in a parenthesis that opens on it, `(next)` or `(next, …)`, after a space or a line start; in a
section's `applies` marker and the manifest's version fields, the word itself. `(next)` alone was not enough for code:
`if (next) {` and `swap(next)` are code, so in a source file only a comment is read (a comment opener inside a quote
is not one), and a string never is (a test's name is what a claim names). A code span, wrapped over a line break or
not, is a quotation. The rewrite skips `games/` (a game folder is written through the Studio's journal,
`tests/single-entry.test.ts`), the LOG, `docs/`, the CHANGELOG's released sections and `tests/fixtures/`. On today's
tree the dry run finds only the marks this branch wrote.

The wiki reads `next` before the release writes it: `compareVersions` puts it after every version, so a section
`applies: next..` is not true of the current product and a publication of it is refused as "after the released
product"; the manifest accepts `next` in `appliesFrom`, `appliesUntil` and `featureSince` only.

Translation pairs are hashed on their raw section text (and a claim's review on its block's text and its test file's
hash), so rewriting the mark in both languages would leave every touched pair to review, and a claim to a person
again. The step `next mark` runs after the fold and carries each hash that held the text before the rewrite over to
its value after it, side by side (`tools/next-mark-records.ts`, `rekey`); a stale record stays stale. Tested on a copy
of the wiki with a claim's block and its test file marked.

`release -- check` and `prepare`'s stop before the push run the four tests (`VERSION_TESTS`), under a second. Nothing is
added to pull requests' CI, and #443's "Not done, on purpose" stands.

This branch converts its own fragments and `406-quarantine-firefox-hosted.md`, already on main: `--check` reads every
fragment and would refuse its version. Fragments of branches still open that say a version number will need the mark once this
lands.

→ next: the first release that writes the mark (next): the dry run's list before `prepare`, and nothing to review after.
