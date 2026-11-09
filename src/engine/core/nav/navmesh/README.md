# navmesh 2.3.1, vendored

The walk areas' shortest paths (`../walk.ts`) come from [navmesh](https://github.com/mikewesthad/navmesh) by Michael
Hadley, MIT (`LICENSE`, with the notice of javascript-astar, which its bundle contains).

## Why it is here and not in `dependencies`

`navmesh@2.3.1` (the latest, unchanged since 2022) declares `"javascript-astar": "github:mikewesthad/javascript-astar"`,
a git dependency. npm 12 refuses git dependencies by default (`allow-git` is `none`): every install that reached
navmesh failed with `EALLOWGIT`, in this repository's `npm ci` and in a game's `npm install @quest-n-click/engine`. An
`overrides` entry would only help this repository (npm reads the overrides of the root project, never a dependency's).
navmesh's build already holds A*: its `dist/navmesh.js` requires nothing at run time, only its type definitions import
javascript-astar. So the engine carries that build itself.

## What the files are

- `navmesh.js`: the package's `dist/navmesh.js`, its first line byte for byte, in a wrapper that runs the UMD bundle as
  an ES module and exports `NavMesh`. Its `//# sourceMappingURL=navmesh.js.map` line is left out (the map is not
  carried). `tests/vendored-navmesh.test.ts` rebuilds the upstream file from it and checks its SHA-256:
  `6c3058be1dd813059b2d52bc2063eed97618b4cee8d59cbd61bc0565f8d217f3` (from
  `https://registry.npmjs.org/navmesh/-/navmesh-2.3.1.tgz`, integrity
  `sha512-psNjH0lNJbprtlTNo4gmhqIgNhZxQgxiGtnGAOmtL7I/tByoGfAfDX+/LD/5b26XuLZw3XXTr0+tHScnm5MBWw==`).
- `navmesh.d.ts`: its `dist/*.d.ts` folded into one file, with javascript-astar's `GridNode` written out.
- `LICENSE`: navmesh's licence and copyright, then javascript-astar's.
- `vendored.json`: name, version, licence and source, read by `tools/dist.ts` (a build's `THIRD_PARTY_NOTICES.txt`)
  and `scripts/sbom.mjs` (the engine's SBOM).

## Updating it

If navmesh publishes a version without the git dependency, go back to the package: add `navmesh` to `dependencies`,
import it in `walk.ts` (the named `NavMesh` export), delete this folder and its entries in `tools/dist.ts`,
`scripts/sbom.mjs` and the test. To take a newer build here instead: `npm pack navmesh@<v>` in a scratch folder, paste
the first line of its `dist/navmesh.js` between the markers of `navmesh.js`, fold its `dist/*.d.ts` into
`navmesh.d.ts`, update `LICENSE`, `vendored.json`, the SHA-256 above and in the test, then run the walk tests
(`npx vitest run tests/walk`) and `npm run solve`.
