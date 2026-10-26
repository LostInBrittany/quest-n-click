## the flakes, by cause

Every failure of 11 to 25 October (400 runs, 80 failed, 16 re-run) read from its job log; #356 lists them with their run
ids. Already fixed and left alone: the apt stalls under `playwright install --with-deps` (#261, #340/#342, #353), the Firefox
frame waits of the latest preview (#255, #264), #210's step 6d, the wiki suites' limits of 23 October. Windows: 12 of
its 13 failed jobs were real failures of their branch, one was load; nothing Windows-specific to change. Fixed here:
`studio-scenario-map` (a child per `ir()`/`map()`: three of six loaded local runs failed, none since; the game folder's
module is imported once per state of its files, `groupings.json` aside, which nothing imports, and each call gets a
copy), `wiki-publication` (one seeded bare repository copied per test, the tip read in it with `ls-tree` and `show`),
the explicit limits (`release-stable`'s three blocks that run steps, the wiki push, `pixel`'s Python, `exit-on-tap`, the
own-wiki bundle at 300 s like its neighbours, H10 at 60 s like its neighbours, what the scenario map still starts). Ten
loaded copies of the seven files at once: 127 timeouts before, none after; what still fails there is `studio-collab`'s
503 from the Studio's own limits, out of reach of a test limit. `e2e-studio-hosted.ts` 4b gets 6b's recovery (a silent
frame for 15 s, one more click). `e2e-pwa.mjs`: WebKit's "access control checks" (any CORS-mode load that failed, the
palette swap's `crossOrigin` frames) asked again offline as an image with `crossOrigin`, drawn → a warning, refused → a
failure; both paths run locally with injected messages. `scripts/e2e/lib.mjs`'s walkthrough waits 15 s for a title
button or a room before it decides (`launch` waits for `window.__game` only). Found on the way: `tools/wiki/claims.ts`'s
`testNames` took `.` as the character before a `describe` when a comment ending a sentence sat above it (the raw source,
trimmed), and dropped that describe's title; it reads the scanner's own last significant character now, and
`wiki-proofs`' fixture has such a comment. The two claims on `studio-scenario-map.test.ts` (`groupings-only`,
`groupings-unknown-refused`) lost wanoo's review with the file's hash: recorded again as an AI's, a person's to redo.
