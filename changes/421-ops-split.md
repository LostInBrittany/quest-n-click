### Changes

- **The Studio's operation core moves to `studio-server/src/ops/`** (4.2.1, neutral). `core.ts`, `source.ts`,
  `apply.ts` and `errors.ts` leave `tools/studio/` for the Studio Server's package, where the transactional operations of
  the next pull requests grow. Nothing an author sees changes: the dev server, the MCP server, `npm run studio-apply`
  and the demo Studio run the same code from its new place. The browser Studio now names its API through one constant
  (`src/studio/api-base.ts`) instead of spelling `/__studio/api` in six modules.
