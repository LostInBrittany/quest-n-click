## CI in minutes, part A of "Simple release" (#302)

Measured on #300's run (40177464627, `tools/release/` and tests, 36 min in all): `windows` 15.4 min, `coverage` 13.3
(12.4 of it the tests), `node-24` 9.8, and each waited 15–21 min for a runner. `tools/ci-plan.ts` gains a `coverage`
gate, opened by product code only; `ci.yml`'s `coverage` job then runs `test:coverage` and the ratchet, else the plain
`test:node` (the plan spares the instrumentation, never the tests: `check` runs no unit test). `windows` and `node-24`
leave the documentation's publication tools, the repository tools and `tests/`; the hosted-Studio rule keeps
`studioHosted` alone. `pr-gate` says a red `pwa-firefox` as a warning (#257). The candidate's `mutation` matrix runs 8
at a time. Spec: docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md (part A); plan: docs/dev/plans/4.5.4-a-ci-in-minutes.md.

→ next: the unit suite is still ~9 min on every PR; sharding it over parallel jobs is what brings a tooling PR to a few
minutes. Then part B (the release PR made by one command).
