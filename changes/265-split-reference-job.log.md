## 4.5.0: the reference job's Chromium work in three parallel jobs (#265)

- The cause: `reference (chromium)` was the last job of every run (run 39958590812: 36.3 min of 43.9; run
  39914754905: 18.4 of 24.1), everything else done by 12–15 min. Once in Playwright's image (#261), about 15 min of
  sequential work stays: build 1.5, keyboard e2e 2.8, French then generic e2e 5.4, visual + perf + weight 0.6, music
  0.4, taps 0.4, the `heroes` build, proof and e2e 4.1.
- The change: `reference` (chromium, webkit) keeps its names, required by the ruleset of main, and its work but the
  French and generic line and the `heroes` steps. Two new jobs on the `reference` gate, in the same image: `reference-fr`
  (its own `GAME=reference` build, then `--lang fr` and `--generic --axe --save`) and `heroes` (`GAME=heroes`: build,
  `solve --prove`, the e2e). Expected: about 7, 8 and 6 min with setup. `check`'s `dist` is the demo's, so each job
  builds its own game. `pr-gate` needs both; `JOB_OF.reference` names them; the CI page of the wiki (EN, FR) too.
- `tests/ci-plan.test.ts`: the two jobs gated like the others; each check in exactly one of the three jobs; nine jobs
  in Playwright's image instead of seven.
- Checked: `tests/ci-plan.test.ts`, the YAML parsed, `actionlint`; the jobs themselves only run on CI.

→ next: review.
