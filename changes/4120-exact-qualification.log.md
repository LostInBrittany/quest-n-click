## 4.1.20 PR 3: the candidate qualifies exactly what it publishes

- Plan §8, §10.2. Neutral split first (commit 2 of the branch): `scripts/ops-qualify.mjs` is now an entry over
  `scripts/ops-qualify/` (setup, topology, signals, runs, backup, report, steps). Every line of the 4.1.19 script is in
  the split, apart from renames and re-indentation, checked by a line count of both. Its 24 steps are pinned by name
  and order in `tests/ops-qualify-split.test.ts`. The `qualify` path filter and `ci-plan` follow the folder. The first
  commit (the download retry, the SSH host key) touches neither file, so the split comes before every change of the
  qualification.
- Behaviour, after the split:
  - the step catalogue (`steps.mjs`) gives each step its id, its time budget (said when passed, never a failure) and
    whether `--short` runs it;
  - report schema 2;
  - the full profile in a candidate started by hand, judged by its gate;
  - two new steps: refused while serving, and replace-store;
  - "ran to its end" is said on success too, so that the gate reads every id.
- The manifest of artifacts replaces the YAML lists release.yml and ship verify kept apart. release.yml's fallbacks for
  tags without a candidate (pack, npm sbom) are removed. Every tag that still publishes has a candidate (from 4.1.17;
  published releases are never replaced).
- Perf (§8.3): `docs/dev/baselines/load.json` is seeded from candidate 38172871690 (4.1.19, one load each). The 4.1.20
  release replaces each figure with its median of three.
- Memory (§6.5): measured by the PR's own candidate run (full-ci), then by the technical candidate. A restore's
  `--max-rows` bounds only the safety backup: the row bound is the export's. A restore is bounded by its bytes before
  the parse, which is what the tool checks. The envelope rule that refuses a file before the parse is decided from
  the measures (LOG).
- Also from the #110 and #111 failures: `external-consumer.mjs` retries its download (504 on two runners at once), and
  `connector-archive-e2e.mjs` checks its SSH host key and draws it again ("Malformed OpenSSH private key").
- Second reading (subagent, 13 Oct, read-only). No P0. Fixed:
  - The two restore steps proved nothing about deletion or refusal: the store already equalled the file. One proposal
    the file does not hold is now written after the backup. The refused replace-store must leave it (and write no
    safety file); the real one must remove it, and its safety backup must count one signal more than the file.
  - backup-memory's read peak was tsx's wrapper (tsx re-spawns a child the exit hook never sees). It is now measured
    in one process (`node --import tsx`), through the checkout's `bridge/src/backup` at the candidate's commit.
- First CI of #119 (13 Oct): `backup-memory` red on both stores. The read imported
  `<archive>/src/backup/index.ts`, but the Bridge archive ships one bundle (`src/cli.mjs`) and no sources; locally,
  without `--bridge`, the checkout's sources were found. Export and restore still run the archive. The read now runs
  the checkout's module, which the bundle is built from at the same commit, and the report says so (`bridge`,
  `readModule`). A dying command now reports its error line, not Node's trailing `Node.js v22…`. Reproduced on the
  extracted archive with `--bridge` before and after.
- Measured there (warnings, not failures): SQLite's merge restore peaks at 1.4 GB for a 64 MiB backup and 3 GB for
  256 MiB, export at 0.7 to 2.4 GB, far above the 512 MiB container. PR 6 writes the envelope from these figures in
  REALITY-OPS; reducing it is a 4.2 follow-up, not a 4.1.20 change.
  - `tools/release/candidate.mjs` imported `scripts/`, which the web-scumm package does not ship: the catalogue is now
    passed in, loaded by the CLI from the checkout, with a test that no release tool imports scripts/.
  - release.yml's manifest check is guarded on the file, as every step a tag may predate.
  - The image's `buildx` (not "BuildKit") field is null on a host without it, never a reason not to build.
  - fetchRetry's timeout bounds the wait for the headers, not the read of a large body, and a caller's own signal
    still aborts.
  - The gate's summary prints each load once, adds the medians, and lists the new artifacts among those that can be
    missing.
  - SUPPORT (EN and FR), ops/qualify/README and GO-NO-GO no longer say the candidate runs `--short`.
  - Not a finding: the three Postgres loads share one protocol, since bridge-load deletes its tenant on an external
    store (`tools/bridge-load.ts:119`) and runs-load deletes its runs.
  - Carried by hand when 1c was merged in: its 4.1.17 hunk (migrate to schema 5) into
    `scripts/ops-qualify/backup.mjs`.
- `e2e:pwa` on WebKit: "Context is stopped", once every check of the scenario passed, seen a second time (#118, 13 Oct,
  after #111). As the 4.1.20 plan said to do if it came back, it is now reported (a warning) and not counted, only
  after every check passed and only that exact WebKit message. Any other browser error still fails.
