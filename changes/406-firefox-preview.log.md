## `studio-hosted`, step 4b: one navigation, a new Studio page for a silent frame (#406)

The failures (#390, #396, 4.7.0's release merge, run 42034234544) share one shape: in Firefox only, right after the
PUT of `[123, 321]`, step 4b clicked "Reload view" (a navigation of the editor's iframe to revision 1's preview) and
the Studio then reloaded the same iframe by itself when revision 2's preview was ready (`previewReady` →
`reloadIfClean`): two navigations close together. Fifteen seconds later the frame, still reported at
`/preview/1/?edit=garden`, answered no evaluation, and #356's second click did not bring it back: four minutes of
2-second timeouts (`shown undefined`), then step 5's unbounded `frame.evaluate` held the run to its 8-minute limit.
The Firefox CSP message in the trace is the Studio page's (127.0.0.1), zod's `new Function` probe, caught: unrelated.

The cause, seen with the witness below (Playwright's Firefox runs on macOS 27 with `CFFIXED_USER_HOME` set to an
empty folder, microsoft/playwright#42768): in one of the maintainer's ten local Firefox runs of the new step, with no
click at all, the frame was still reported at `/preview/1/?edit=garden` and silent for 15 s while the Studio's page
had received the editor's `ready` since the write, i.e. the iframe had loaded revision 2's preview and talked. The
browser and the Studio were fine; Playwright's `Frame` for that iframe had lost its navigation and never answered
again. Navigating the same iframe keeps that `Frame`; a new iframe gets a new one. So:

- no click: the step waits for the Studio's own reload, the one navigation a member gets;
- the frame looked up at each try through its element (`iframe.engine`), each evaluation bounded to 2 s;
- silent 15 s: `page.reload()` once (a new iframe, hence a new `Frame`), then 45 s more;
- a witness on the Studio page counts the editor's `ready` messages since the write: a silent frame with a `ready`
  is Playwright's stale handle, without one the frame itself never loaded (a browser or product question);
- a failure throws with the frame's URL, the count and `page.frames()`; step 5's probe is bounded to 10 s.

Checked: Firefox 30 runs with the fix (the maintainer's 10, 20 here), step 4b green in all 30, one of them through
the new Studio page (`1 ready` said); one run of the 20 hung later, in 6d "Prepare assets" with the machine loaded
by a full `vitest run` alongside, nothing to do with the editor's frame. Chromium and WebKit green; a forced silent
frame in Chromium recovers once (`1 ready` said), and a frame always silent fails the run in 68 s with the evidence,
not 8 min. The baseline, main's step in Firefox on the same machine: 20 runs, 20 green, no silent frame. Locally the
fault is too rare to show a before/after difference, so the quarantine stays until CI's Linux runs say more.

→ next: let the quarantined Firefox step run on CI; once it has a clean streak (or a failure with the witness says
which side is silent), un-quarantine it in `ci.yml` and `tests/ci-plan.test.ts`.
