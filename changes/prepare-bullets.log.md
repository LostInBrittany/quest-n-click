## the upgrade notes start from whole CHANGELOG bullets

`prepare`'s `upgrade notes` step read the release's CHANGELOG section with `sectionBullets`, which kept the lines that
start with `- `: a bullet wrapped over several lines (nearly all of them, as `changes/*.md` writes them) lost every line
but its first, and 4.5.4's section opened on sixteen half-sentences (#333). `changelogBullets` (exported, was
`sectionBullets`) keeps each top-level bullet with what follows it while the lines are indented or blank: continuation
lines, a nested list, a paragraph of the same bullet, as written. A heading, the intro or any line at the margin closes
it; the blank lines between bullets are dropped, so `upgradeNotesSection` writes one tight list, the shape the final
4.5.4 notes have. Tests: a wrapped bullet, a nested list, two bullets with no blank line between, a bullet with a
second paragraph, the headings, another version's bullets. `tools/changes.ts` keeps a fragment's text whole and no
other release tool filters bullets by line. `changes/release-first-parent.md` opened on `### Fixes`, a heading
`--assemble` refuses: it is `### Fixed` now, or 4.5.5's `prepare` would have stopped at its changelog step.

→ next: 4.5.5's release, whose upgrade notes start from whole bullets.
