### Fixed

- **A looping script restarted during a step no longer skips its next step (next, #484)**: leaving and re-entering a
  room, or switching character, while a looping script was inside a `wait` started a second copy of the loop. The two
  copies both moved the script on, so the command after the `wait` was skipped (a counter not counted, a line not
  said), and a later `startScript` could start a third copy. The loop that is already running now simply goes on.
