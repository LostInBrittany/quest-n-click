### Changes

- **The game's health by revision, and the revision that broke it (4.2.2)**: a hosted Studio's header says the
  verdict at a revision (the validator, then the solver from a new game, on the processing worker, after each burst
  of changes). When a revision fails where the last judged one passed, a bisection names the first failing revision,
  with what its operation did and its files, in ⌈log₂ n⌉ checks; a dev can ask for one (`POST /api/health/bisect`). A
  solver cut short says "unknown", never "valid".
