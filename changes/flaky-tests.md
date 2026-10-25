### Fixed

- **The recurring CI flakes of the last two weeks, by cause (4.5.5, #356)**: the unit tests that passed alone and
  timed out in a loaded run cost less where the cost was their fixture's (the scenario map imports the game once per
  state of its files instead of a child per call; the wiki push copies one seeded repository and reads its tip without
  a clone, a test 0.04 to 1.4 s where it took 0.8 to 4.5), and set their own limit, with a comment that says why,
  where the processes are the test's subject (real bash steps, git pushes, Python cuts, real-time walks, the whole
  wiki's bundle). `e2e:studio-hosted` clicks "Reload view" once more when Firefox's room editor stays silent 15 s, as
  its step 6b does since #264; `e2e:pwa` asks WebKit's "due to access control checks" loads again offline the same
  way and counts only those refused again; the walkthrough waits for the title screen before reading it. Nothing is
  skipped; the CI page's "Known flakes" table says each.
