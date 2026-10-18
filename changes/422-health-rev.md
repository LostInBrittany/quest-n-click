### Changes

- **Every diagnostic says its revision (4.2.2)**: on a hosted Studio each read answer carries the revision it was made
  at (`x-studio-revision`); the Check tab shows it, and marks its results stale as soon as the head moves on.
- **Lint, the solver and the playtests run on the processing worker (4.2.2)**, with the game's own commands (before,
  a hosted Studio ran them on the data it read back, without them); the solver is bounded to 45 s there.
