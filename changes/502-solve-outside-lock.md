### Fixed

- **A Solve no longer freezes the team's Studio (next, #502)**: on a hosted Studio, a Check run (solve, lint,
  playtests, validate) held the instance's lock for as long as the worker ran it, up to 45 s for a solve, and a write
  sent meanwhile waited for it, with every read queued behind that write. The lock is now held only while the game's
  files are packed for the worker: saves and page loads go through at once, and the result still says the revision it
  was packed at.
