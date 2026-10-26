### Fixed

- **The mutation cache's input hash follows only what a test runs (4.5.6, #371)**: a CRLF fix in the wiki checker
  (#368) moved `core`'s hash and re-ran every mutation set of the release candidate (about three hours of CI), through
  `vite.config.ts` → the Studio's dev-server plugin → `import type { DocsSet } from '../wiki/docs'`. The import closure
  now reads each module with the TypeScript parser and skips what the compiler erases (`import type`,
  `export type … from`, an import or re-export whose every name is a type, `typeof import('…')`); an import with one
  value in it is still followed. `vite.config.ts` and `vitest.mutation.config.ts` are hashed as files, and their
  imports followed only into what can change a test's run (`CONFIG_FOLLOWS`: the game's settings, the values of
  `define`, the test order, the sets), not into the Studio plugin (`CONFIG_SKIPS`, with its reason);
  `tests/mutate-hash.test.ts` fails on a new import in a configuration until it is placed. `core`'s inputs go from 260 files to 182, the largest set's
  (`reality`) from 363 to 217. Every set's key changes once with this release: the first candidate or nightly after it
  runs each set cold.
