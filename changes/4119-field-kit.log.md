## 4.1.19 PR 2b: the Field Kit v2 and one provenance contract

- Plan §6.5.
- **`tools/release/provenance.mjs`** has four composable functions; only the last one asks GitHub:
  1. `readCandidateManifest`;
  2. `digestProblems`;
  3. `verifyAttestation`: offline with `--bundle` and `--custom-trusted-root`, else online, with the signer workflow
     and the source ref;
  4. `queryRun`, with `candidateRunProblem`.
  `ship` uses them (`verifyCandidate`, `verify`). The file is `.mjs`, because `ship` runs on plain Node 22.12.
- **`tools/field/tar.ts`** reads and writes the bundles in memory. It never hands someone else's archive to a system
  `tar`. It keeps regular files only, refuses unsafe names and duplicates, and enforces budgets set before inflating,
  so a gzip bomb stops at the budget. Its output is deterministic.
- **`tools/field/bundle.ts`**, bundle schema 2: the report, the evidence under the report's own paths (no more
  `evidence/evidence/`), `candidate-manifest.json` and its attestation. `verifyBundle` says integrity, candidate and
  authenticity apart:
  - **offline**: the attestation against a trusted root, signed by `candidate.yml` on main, naming the manifest's run;
  - **online**: the same attestation, plus the run read now;
  - **an older candidate**: the manifest the run keeps.
- **Attestation and budgets**: the candidate's gate attests `candidate-manifest.json`, on `workflow_dispatch` only and
  with job-level permissions. `field:init` downloads the attestation. `field:check` enforces the evidence budgets and
  does not scan a file above them.
- **Tests**: a stand-in `gh` answers as GitHub would. They cover links, devices, extended headers, unsafe names, a name
  twice, the budgets, a bomb, an altered or added file, another candidate, attestations offline and online, a run that
  is not green, and the manifest a run keeps.

- **Second reading** (an automated second context) confirmed that the `gh` flags are real and that offline mode does
  not touch the network. It also found:
  - **A bundle could fail its own check.** The compressed limit was below the total, and `makeBundle` ignored it. The
    limits are now aligned at 64 MiB, and `makeBundle` counts every file.
  - **The tar writer cut long UTF-8 names by characters.** It now cuts by bytes, or refuses the name.
  - **`field:init` could keep the previous candidate's attestation.** It now removes it first and says why a download
    failed.
  - **`verifyBundle` missed some checks.** It now refuses an archive or a path outside `evidence/`, scans
    `report.json`, and names a schema 1 bundle instead of throwing a raw schema error.
  - **The `gh` calls were outside the one-minute budget.** They are now bounded by it.
  - **The ustar prefix was read without checking the magic.** It is read only after the magic.
  - Recorded deviation from plan §6.5: the run's `headSha` is main's tip, not the tested SHA. The attestation, or the
    manifest the run keeps, binds the SHA instead.

→ next: Claude · the second reading of #103 (SBOM bom-ref, the Bridge in the image's SBOM, stricter locks)
