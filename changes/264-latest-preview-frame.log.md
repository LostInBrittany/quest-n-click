## 4.5.1: e2e studio-hosted, the Play frame after "Load the latest preview" waited for as in 4b (#264)

- Cause: step 6b clicked "Load the latest preview" twice, each followed by a loop that took the Play frame as soon as
  its URL held `/preview/${ready}/`, then one `waitForFunction` of 30 s on that `Frame`. In Firefox, the frame caught as
  its navigation commits may never answer an evaluation (already seen in 4.2.2 PR 3b, which bounded step 4b's): the
  wait timed out, and the failure dump's own `evaluate` on it hung until the run's 8 min deadline. The second click
  also reused the `ready` read before the first: before #256 the first could read 2 while 3 was building, so the
  second loaded 3, its loop never matched, and after 80 tries it went on silently. All four CI failures were on the
  Firefox pass: runs 39601284222, 39402884553 (attempt 1), 39232599877 (second click), 39978416632 (first click, with
  #256's check passing, ready 3, head 3).
- Fix, in the script only: one `loadLatest()` for both clicks. At each click it waits for the head's preview and reads
  `ready` again (#256's check), marks the page in the frame, clicks, then for up to 45 s looks the frame up again at
  each try and bounds each evaluation to 2 s (`within`, as 4b), until the frame at `/preview/${ready}/` runs a game
  that is not the marked page. Silent for 15 s at the right URL: clicked once more, with a `note:` line in the output.
  At the deadline, an error that names the URL instead of a bare timeout. The failure dump bounds each frame's
  evaluation to 5 s.
- Checked: the CI failure was not reproduced locally (33 Firefox runs, some with the room editor's reload delayed onto
  the click, some under CPU load, all green). The retry path was forced once (no answer for the first 17 s): both
  clicks noted, then passed. Then Chromium and Firefox four times each, green; `npm run quality`, `tsc`,
  `changes --check`.

→ next: review.
