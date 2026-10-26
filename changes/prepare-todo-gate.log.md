## the `TODO(release)` prose before prepare pushes

After #326 `prepare` held the push on the docs' human gates, but not on the `TODO(release)` prose it writes itself: the
pull request opened with the markers in, `release -- check` failed on them, and the prose was pushed after, a second
CI run. The step before the push (`before the push`, was `human gates`; `RESUME_STEPS` with it) now reads the same
markers as `checkRelease` (`todoBrief`, of which `todoMarkers` is the `file:line` list) and the human gates, and
`beforePushStop` (was `gatesStop`) says both in one stop: each marker with its line as the brief (cut at 200
characters), each ✖ line of the gates, the translation pair the upgrade notes make, the same command to run again. It
returns nothing when both are clean, and only then does `prepare` push. A first run always stops (it has just written
the markers); the person or their assistant writes the prose on the local branch, and the run again pushes once. No AI
call from the tool, no prose written, no review recorded. The pull request's body no longer lists prose left (there is
none by then). The releasing page (en, fr) describes the flow.

→ next: 4.5.5's release, the first to push its pull request once.
