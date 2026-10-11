## 4.1.19 release: version, README, docs, the candidate's baseline

- Plan §11–§13. Version 4.1.19; the golden save `demo-4.1.19.json`; the reference run re-recorded (engine 4.1.19).
- **README en/fr rewritten** from the drafts reviewed with the plan: logo, value sentence, play / Studio / start,
  the hero capture, the quick start, "Build a game", "Prove and ship it", "Further", the maturity table, how it is
  made, figures between their markers only. Captures retaken (`docs/img/readme/4119-*`, the `v36-*` kept): hero,
  conversation, minigame, map, ending, Studio rooms, storyboard, assets, check, the puzzle graph. A Studio Remix
  capture was tried and left out: the tab is unstyled tables, not a page to show first.
- **What the second look found in the drafts:** the quick start ran `npm run assets` (Python 3 and Pillow) while the
  text called Python optional, and pointed at `npm run doctor`, which a created game does not have. Both corrected;
  `tests/readme-truth.test.ts` now checks every `npm run` of the block against `cli/create.mjs` and every
  `npx web-scumm <cmd>` against the CLI.
- **`readme-quickstart`** (`scripts/readme-quickstart.mjs`): the block under "## Start" read from README.md, its `T=`
  required to be this version's URL, then pointed at `file:` the candidate's archive; `npm run dev` runs until it
  answers, then the commands its comment names. The script runs in a process group of its own, stopped by its id.
  Locally: green from a fresh `pack` (create, install, assets, dev answering, verify, build).
- **The candidate's baseline** (`tools/release/baseline.mjs`, plan §12.2): `candidate-gate` reads its artifacts
  (heavy ×3, both loads and leaderboards, every mutation report, `ops-qualify.json`, the archives, the SBOMs, the
  image's identities) and its jobs (`actions: read`), writes `baseline-<version>.json` and `.md` into the manifest's
  folder and uploads `candidate-baseline`; `release.yml` publishes them as `web-scumm-<tag>-baseline.*`. The
  committed sheet `docs/dev/baselines/4.1.19.md` holds thresholds and protocols and no run number.
- Docs: UPGRADING §31 (backup schema 3, the JSON-lines restore refused, `connectors-pure`, the locks, the five SBOMs
  and the engine SBOM's new meaning), ROADMAP, PROGRAM, SUPPORT, `docs/dev/passes/4.1.19.md` (the §14 criteria, the
  thirteen passes not-run), GO / NO-GO 4.2 (machine proof updated, every verdict unchanged, NO-GO).

→ next: the final candidate on this SHA, `field:init` on #75–#87, the RC and the stable tag on that run, the nightly
classified.
