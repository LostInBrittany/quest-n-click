## #410 PR 6: `prepare` writes the release's prose it holds the facts of (options A + B)

The maintainer chose options A and B of PR 6 (`docs/dev/PLAN-4.6.x-RELEASE-IN-THREE-COMMANDS.md`). Of the 16 to 18
`TODO(release)` markers a release left, most were facts `prepare` holds; each step now writes the bullet of the LOG's
release entry whose data it just produced (`withLogFact`): the pull requests merged since `v<previous>` (from `git log
--first-parent`, merges and squashes, the release branch left out), the fragments with main's commit, the upgrade
notes' section written ahead or appended, the pending acks the fold takes in (read before it deletes them), the
fixtures, the passes against `passesFor(<previous>)`, the signature. The passes sheet's intro is 4.7.0's sentence when
no pass changed. A fragment's `### Release` lines, read before `--assemble` deletes the fragments, make the CHANGELOG's
intro and the README line (option B: one text for both).

Decided here: **`### Release (fr)`** rather than an English line in `README.fr.md` or a marker there. The README is the
one release text in French; translating it is release-day work this PR is meant to remove, and the author knows the
change best. The French line is written only when every fragment with a `### Release` has its `(fr)`, so the French
README never says less than the English one; otherwise it stays a marker. The CHANGELOG intro closes on "The upgrade
notes say what a game has to do." rather than guessing "Nothing to change in a game": `### Breaking` does not say it
(4.6.0 had none and one case to act on). The Signature bullet names `.github/allowed_signers`, not a person: `prepare`
does not know who will run the release command, which refuses any other key. The LOG bullets and the intro are
wrapped at 120 columns, a code span never cut.

Left a marker, a person's to write: the LOG entry's title, its request and its next; the upgrade notes' opener when
the section is appended; an intro or README line no fragment gave; a passes sheet whose passes changed. On the 4.5.3
fixture: 16 markers before, 5 with release lines, 8 without; 3 when the upgrade notes were written ahead.

`wiki/en/contribute.releasing.md` (and its French) still says `prepare` "writes no prose"; it is #410 PR 3's page, left
to that branch.

→ next: the first release with `### Release` lines (4.7.1): count the markers left and reread the assembled intro.
