## The mutation cache's input hash follows only what a test runs

Measured on 2026-10-26: `core`'s `inputHash` moved between 16d86402 and 301f199d (297e687a1328a01b → 0d07622305297f16)
and the only input that changed was `tools/wiki/page.ts` (#368's CRLF fix). The chain: `vite.config.ts` (a root of
every set) → `tools/studio/plugin.ts` → `tools/studio/types.ts` → `tools/wiki/docs.ts` (by `import type`) →
`tools/wiki/page.ts`. Two causes: the closure's regex followed type-only imports, which are erased before a test runs;
and `vite.config.ts` was followed into everything the dev server and the build use. Ruling: `runtimeImports` reads a
module with the TypeScript parser and keeps what loads at runtime (imports and re-exports with a value, side-effect
imports, `import {}` to be safe, `import()`, `require()`); the configurations are hashed as files and followed only
through an allow-list (`CONFIG_FOLLOWS`: `tools/game.ts`, `tools/vite/plugins.ts`, `tools/extensions.ts`,
`tools/unit-shards.ts`, `tools/mutation-sets.ts`), the Studio plugin skipped with its reason (`configureServer` only,
no `transform`, `resolveId` or `load`). An allow-list rather than a deny-list, and a test that both lists cover exactly
the configurations' imports, so a new plugin is classified by a person instead of entering or leaving the hash silently.
Closures before → after: core 260 → 182, reality 363 → 217, connectors-pure 247 → 94, remix 240 → 151, speedrun
247 → 157, runs 248 → 81, voices 230 → 171, reality-store 230 → 106, connectors-edge 247 → 94, reality-store-postgres
227 → 67, studio-ops 221 → 178, studio-auth 222 → 178, studio-workshop 232 → 185 (the studio sets keep the wiki tools:
`tools/studio/backend.ts` imports `tools/wiki/docs-load` for a value). Proof on the repository: a line added to
`tools/wiki/page.ts` keeps `core`'s and `reality`'s hashes, a line added to `src/engine/core/engine.ts` moves both;
`tests/mutate-hash.test.ts` pins it on a temporary repository (a value import moves the hash, a type-only one does not;
sources, tests, survivors, the lockfile's dependencies move it, its version does not).

→ next: the first nightly after the merge runs every set cold once, then the cache holds across wiki and Studio fixes.
