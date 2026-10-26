## A CRLF page keeps its code fences; the wiki tools run on Windows

Release PR #366's `windows` job failed two tests of #363's `tests/wiki-pending.test.ts`: three errors on
`en/create.rooms.md` lines 24, 26 and 30, the fixture's links inside code fences, "resolves to wiki/en/nowhere.md". The
test's temporary repository has no `.gitattributes`; on the Windows runner (`core.autocrlf=true`) every file git
switches or merges is written CRLF, and only the two tests that switch and merge before checking failed, on the page
both branches changed. `mapLines` and `parsePage` (`tools/wiki/page.ts`) split on `\n` and test each line against
`FENCE_MARK = /^\s*(`{3,}|~{3,})(.*)$/`; `.` does not match `\r`, so ` ````md\r` never opened a fence. A checker bug,
not the fixture's: the repository's own checkout is LF by its attributes, a page an editor saved CRLF is not. Ruling:
both functions read `\r\n` as `\n` (only that pair, so a line keeps its number); the hashes were already LF-safe.
Proof: `tests/wiki-line-endings.test.ts` (the fences, every fixture page parsed, and `wiki -- check` on a CRLF copy,
each equal to LF; red before the fix on macOS), and `tests/wiki-pending.test.ts` sets `core.autocrlf=true` in its
repository, which reproduced the Windows errors exactly on macOS. Why #363's CI missed it: `ci-plan` gave the wiki's own
tools and `tests/` the fast tier only; they now open `windows` (`tools/wiki*` but the modules the Studio reads, which
already did, and `tests/wiki-*.test.ts`), pinned in `tests/ci-plan.test.ts`; the CI page (en, fr) says it.

→ next: the release PR's `windows` job, green with this merged.
