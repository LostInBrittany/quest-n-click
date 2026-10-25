### Changes

- **Two pull requests no longer conflict on the test count** (4.5.4): `npm run quality:baseline -- --check` compares the READMEs' figures with the committed `tests/quality-baseline.json`, not with what the checkout measures, so a pull request that adds tests passes without rewriting the READMEs and the baseline (it says the gain as `⚠ better than the baseline`); the figures move at the release (`npm run release -- prepare` runs `quality:baseline`) or whenever someone rewrites them. A changed behaviour still fails until it is rewritten on purpose.
