### Fixed

- **The vendored navmesh can no longer drop out of the notices and the SBOM in silence (next)**: a build's
  `THIRD_PARTY_NOTICES.txt` and the engine's SBOM read navmesh from `src/engine/core/nav/navmesh/vendored.json`, and
  both took a missing record for an empty list. Now the build's seal, `verify:dist` and `scripts/sbom.mjs` fail with
  the file's path, and `verify:dist` also fails when the notices do not name navmesh. The record lists what navmesh's
  build contains as data (`bundled`), so javascript-astar is a component of the SBOM, nested in navmesh's with its
  `pkg:github` purl and in the dependency graph, where scanners see it; before, it was only words in a description.
  One module, `tools/vendored.mjs`, reads the record for both outputs, and tests prove what each output gets.
