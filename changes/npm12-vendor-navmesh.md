### Fixed

- **The engine installs with npm 12 (next)**: `navmesh@2.3.1`, the walk areas' paths, declares
  `"javascript-astar": "github:mikewesthad/javascript-astar"`, a git dependency, and npm 12 refuses git dependencies by
  default (`allow-git` is `none`). Every install that reached it stopped with `EALLOWGIT` – a game's
  `npm install @quest-n-click/engine` and this repository's `npm ci` alike. The engine now carries navmesh's build
  itself (`src/engine/core/nav/navmesh/`, its first line byte for byte, its licence beside it), so `navmesh`,
  `javascript-astar` and `core-js` leave the dependencies; paths are unchanged. A build's `THIRD_PARTY_NOTICES.txt` and
  the engine's SBOM still name it, and a test fails if a lock of the repository takes a package from git again.
