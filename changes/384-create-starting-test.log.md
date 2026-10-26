## `create` writes a starting test, the template's own

#384: `cli/create.mjs` filtered `games/_template/tests` out ("a project checks its game with `quest-n-click verify`"),
so a project had to invent its vitest setup; "Jack cherche un taf" first did it with aliases into the package's
`src/engine/`, which the package's `exports` make useless. Ruling: the template's test becomes the generic one
(imports `game` and `layouts` from `'..'`, the template's `index.ts`, whose `import.meta.glob` runs under vitest in
both places; `Promise.race` on `newGame()` with 300 ms, for an intro that ends on a guided action), and `create`
copies the whole template. One file: `GAME=_template npx vitest run games/_template/tests` passes in the repository,
`npm test` in a created project. `create` also writes `vitest.config.ts` (`include: ['game/tests/**/*.test.ts']`, no
alias), `"test": "vitest run"` and `devDependencies: { vitest }`. The version is a constant in `create.mjs` (`^5.0.3`),
since the published `package.json` carries no devDependencies (`scripts/pack.mjs`); `tests/create.test.ts` runs
`create` into a temporary folder and holds it equal to the repository's. `projectScripts` (`tools/wiki/ref-scripts.ts`)
read only `` `${NAME} …` `` entries: it now reads a plain `'…'` command too, and `reference.npm-scripts` describes
`test`. `npm run fresh-install` runs the created project's `npm test` after `verify`. `games/signals/tests` keeps its
own older test (it imports `layout/start.json` by name); not touched here.

→ next: `quest-n-click migrate` or the Studio's engine upgrade could offer the three files to an existing project.
