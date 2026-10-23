### Fixed

- **The scenario map's span can be leased on a shared Studio** (4.5.0). `POST /api/leases`, `/api/leases/release` and `/api/leases/takeover` answered 400 for the span `groupings` (`groupings.json`), though the Spans panel lists it. The routes now accept exactly the spans `studio-server/src/ops/spans.ts` gives files (plus `room:<id>` and `lang:<code>`), so the two lists cannot drift apart again.
- **`npx quest-n-click doctor` runs in a created project** (4.5.0). It imported Playwright at the start and stopped with `ERR_MODULE_NOT_FOUND`, since a created project does not install it. Without the package, the doctor now reports Playwright as optional and missing, with the fix: `npm install --save-dev playwright`, then `npx playwright install chromium`.
- **`npm run page:world` and `npm run page:puzzles` write a `.html` file** (4.5.0). By default they wrote `dist-pages/world` and `dist-pages/puzzles`, without an extension; an explicit `--out file.html` is still used as given.
