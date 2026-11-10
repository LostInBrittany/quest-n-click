### Fixed

- **A locked archive without its `npm-shrinkwrap.json` stops the pack and the SBOM (next, #546)**: npm 12 leaves
  `npm-shrinkwrap.json` out of the archive `npm pack` writes; npm 10 and 11 keep it. Packed with npm 12, the Bridge,
  connectors and Studio Server archives would have shipped without their lock, and `scripts/sbom.mjs` would have made
  their SBOMs from the root lock without a word. `scripts/pack.mjs` now checks each archive right after `npm pack` and
  stops on a locked one without `package/npm-shrinkwrap.json`, naming the archive and the npm version that packed it;
  `scripts/sbom.mjs` reads the root lock for the engine only, and throws for a locked archive without its shrinkwrap
  (`scripts/locked.mjs`). What is published is unchanged: the candidate packs with npm 10.
