## Shared figures out of pull requests: the baseline's two writes, the first visit in bytes, the floors as data (#405)

On 4 November 2026 two open pull requests (#399, #400) spent most of their CI on figures every pull request shares: the
first visit crossed a rounding edge (137.9 → 138 KB) and failed `quality:baseline -- --check --dist`; the reference
chapter's budget was raised to 143 with no margin; once #399 merged, #400 conflicted on `tests.files`,
`tests.declarations` and the READMEs' figures only, and re-ran about 40 jobs. #404 raised one coverage floor in
`vite.config.ts`, which moved every mutation set's cache key. Options A, B, C and F of #405; E (zod loaded on demand,
8.4 KB of the first visit) follows after 4.6.0.

A and B: `tools/quality-baseline.ts` has two writes. `toWrite(prev, got, 'pr')` takes the games, the saves and the
surface from the measure and keeps `tests` and `bundle` as committed; `readmeFor(…, 'pr')` writes only
`referenceStates` (behaviour: without it, a pull request that moves the reference proof would fail `readmeDrift`). The
release's write (`--release`) takes everything, the install line included, and keeps the previous bundle without
`--dist`. `readmeDrift` still compares the READMEs with the committed baseline. `tools/release/baseline.mjs` reads
`tests.files` and `bundle.initialJsKB`, both still written by the release. `prepare`'s step runs
`QUALITY_BASELINE_COMMANDS`: `npx vite build` then `quality:baseline -- --release --dist`, so the bundle figure is
measured, where the step without `--dist` used to keep whatever a pull request had last written.

C: `tools/first-visit.ts` (pure): `overBudget(bytes, budgetKB)` fails above `budgetKB × 1024`, `sinceRelease` says the
signed byte difference. `tools/dist.ts` gates on it and adds `initialJsBytes` to `--json`; the baseline's `bundle`
gains `initialJsBytes` at the next release (this branch writes no shared figure, so the committed bundle has none yet
and the warning stays silent until then). Measured on main with #400 (fd8fdb5a): demo 141 373 bytes (138.1 KB, budget 140,
margin 2 027 bytes), reference 146 260 bytes (142.8 KB, budget 143 → 145, margin 2 220 bytes).

F: `tests/coverage-floors.json` holds the global floors and groups of files, each with its reason (`why`), the comments
that sat beside them in `vite.config.ts`. `tools/coverage-floors.ts` flattens them into Vitest's thresholds; it reads
the file at run time, so `inputHash` never sees it, and the module is in `CONFIG_SKIPS` (a mutant run takes no
coverage). `tools/coverage-ratchet.ts` reads the floors there and names the file. `tools/ci-plan.ts`: a change to the
floors alone opens the `coverage` gate (it used to be a shared configuration, which ran everything). The file joins
`CODEOWNERS` beside `vite.config.ts`. Once #400 merged, the global lines measure 78.00 for a floor of 75, which
`coverage-ratchet --strict` refuses: the floor is 77, the first edit of the file, and `core`'s hash did not move
(af4de5cb3f178d81 before and after).

→ next: E, the zod chunk out of the first visit, after 4.6.0; the 4.6.0 release writes the first `initialJsBytes`.
