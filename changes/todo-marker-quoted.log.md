## a quoted `TODO(release)` is not a marker left

A rehearsal of `release -- prepare 4.5.5 --no-pr` on `upstream/main` (90dcb3ac) stopped on "markers" at
`wiki/en/install.upgrade-notes-4-5.md:294-295` (fr: 309-310): `changes/prepare-todo-gate.md`'s bullet, which quotes
`` `TODO(release)` `` and which `changelogBullets` copies whole since #334. `todoBrief` matched the text on any line,
so it could never be written away, and neither `prepare` nor `release -- check` could pass (#364). `proseLines`
(tools/changes.ts) blanks what is quoted as code, line by line: inline spans (a backtick run to the next run of the
same length) and fenced blocks; `todoBrief`, so `todoMarkers` and `checkRelease`, reads the markers there and keeps
the whole line as the brief. Every marker `prepare` writes is bare prose. A span wrapped over a line break is not
seen as one, so its marker counts: the safe way. `prepare-todo-gate.log.md`'s title held a bare marker, which
`--assemble` would have made a LOG heading: it is quoted now, and `fragmentProblems` refuses a bare marker in any
fragment with its file and line. Checked on `upstream/main`: no other file `check` reads holds a bare one. Tests: the
exact bullet, a fenced block, double-backtick spans, a real marker beside a quoted one and after a closed fence.

→ next: 4.5.5's release, whose `prepare` stops only on markers it wrote.
