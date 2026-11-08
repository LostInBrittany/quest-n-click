### Fixed

- **`npm run studio` starts from the installed engine (next, #454)**: the Studio's assistant imports `AGENTS.md` as its
  system prompt, and the engine's package did not carry it, so Vite stopped on "Failed to resolve import
  ../../AGENTS.md?raw" in a game project. The package now ships it, and a test reads every relative import of every
  file the package ships and fails when its target is not shipped too.

### Changes

- **The engine's package no longer carries the maintainers' benches (next, #454)**: `tools/audit-corpus.ts`,
  `bridge-cluster.ts`, `bridge-load.ts`, `golden-save.ts`, `prove-matrix.ts`, `runs-load.ts` and the release commands
  (`tools/release/prepare.ts`, `release-run.ts`) read the repository's `tests/`, `scripts/`, `games/demo` or the
  Bridge's CLI, which a game project does not have: shipped, they could not run. The same test found them.

### Release

A patch for game authors: the Studio starts again from the installed engine, and the engine's package carries only
files that can run in a game project.

### Release (fr)

Un correctif pour les auteurs de jeux : le Studio redémarre depuis le moteur installé, et le paquet du moteur ne
contient plus que des fichiers qui fonctionnent dans un projet de jeu.
