### Changes

- **The README rewritten around three promises** (4.1.19): create a game as data, shape it in the Studio, prove and
  ship it. The first screen is the game, the Studio and a quick start; Reality, Remix and speedrun come after.
  - Captures of this release from the real player and Studio (`docs/img/readme/4119-*`, `npm run docs:screenshots`).
  - A maturity table that agrees with SUPPORT and the GO / NO-GO (`tests/readme-truth.test.ts`).
  - The quick start names Python 3 with Pillow, which `npm run assets` needs; `npx web-scumm doctor` replaces an
    `npm run doctor` that a created game does not have.
- **The README's quick start is played from the candidate's archive** (4.1.19, `npm run readme-quickstart`, a
  candidate job): its lines as written, in a folder outside the repository. After the tag, `--published` checks that
  the README's URL answers with the SHA-256 the release lists.
- **The release publishes the baseline its candidate wrote** (4.1.19, `tools/release/baseline.mjs`):
  `web-scumm-<tag>-baseline.json` and `.md`, read from the candidate's own jobs, in its manifest and attested. A
  measure the candidate did not make is written as such.
