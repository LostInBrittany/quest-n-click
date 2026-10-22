## 4.4.0: a translation's verb keys checked by every caller of validate

- `localeVerbKeyChecks` ran in `tools/validate.ts` only; 4.3.1's reading named the gap (LOG #255). `playerChecks`
  takes `locales` (which `validate` has had since 4.3.1 for the voices) and runs it; the command line's own call is
  gone, so it is checked once. `tests/dom/verb-keys.test.ts`: the clash through `validate`, and nothing without the
  tables. `validate.ts` keeps its line count (the size cap).
→ next: none.
