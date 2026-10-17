## 4.2.1 PR 1: the operation core moves to `studio-server/src/ops/` (neutral)

Branch: refactor/421-ops-split · Plan: `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §7, row 1

- **What moved:**
  - `tools/studio/{core,source,apply,errors}.ts` now live in `studio-server/src/ops/` (git mv);
  - their importers follow: the plugin, `assets.ts`, `assistant.ts`, `backend.ts`, `snapshot.ts`, the MCP server, the
    ids codemod, ten tests, and `npm run studio-apply`.
- **What stays:**
  - `types.ts` stays in `tools/studio/`: 62 importers, shared with the browser Studio;
  - `paths.ts` and the server-side `assets.ts` stay too. `assets.ts` moves with its queue in PR 3 (single entry).
- **The client names the API once:** `apiUrl()` in `src/studio/api-base.ts`.
- **Deliberately not here** (the plan's row 1 listed them; each lands where it has a meaning and a test):
  - typed effects, in PR 2 with the transactions;
  - the `dir` parameter of `bridge/src/migrations.ts`, in PR 2 with the Studio's own migrations. A parameter nothing
    calls would be a surviving mutant in a gated set.
- **Registered:**
  - `studio-server` in `tsconfig.json` and `knip.json`, the same entry rule `tools/studio/*.ts` had;
  - a CI rule (`tools/ci-plan.ts`) with the authoring gates.

- **Second automated reading context** found:
  - P0: the published `web-scumm` package would have left `studio-server/` out (`scripts/pack.mjs`'s `SHIP`), although
    `vite.config.ts` (through the plugin) and `ids` import it. It ships now, which the packed archive confirms;
  - P1: Biome did not cover the moved files. `studio-server/**/*.ts` is now in `biome.json`.

→ next: Claude (PR 2, the transactional core)
