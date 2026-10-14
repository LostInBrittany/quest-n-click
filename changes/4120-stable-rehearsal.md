### Changes

- **A release is made as a draft, then published** (4.1.20). release.yml creates it as a draft, uploads every file,
  publishes it and reads it back. A run on a release already published stops and changes nothing, and a draft an
  earlier run left is made again. This is what immutable releases need, which the maintainer turns on from 4.1.20,
  with a ruleset on the release tags.
- **`ship verify` also asks GitHub** (4.1.20): `gh release verify` and `gh release verify-asset` for each file, from
  4.1.20 on, beside its own sums, attestations and list of files.
- **`ship preflight-stable --candidate=<run>`** (4.1.20) says what 4.2 stable still needs, check by check, and signs,
  publishes and changes nothing:
  - the signing key and `allowed_signers`;
  - immutability and the tag ruleset;
  - the candidate's provenance;
  - each npm package: its archive, name, bootstrap, stage-only trusted publisher, OIDC proof and version;
  - the publishing step's exact Node and npm;
  - GO / NO-GO against the reports.
- **4.2's tag signing, rehearsed** (4.1.20): `ship tag --sign` signs a 4.2 tag with an SSH key, and a 4.1.x tag stays
  annotated. Each candidate rehearses it with an ephemeral key: a signed tag never pushed, verified, then the key
  destroyed. The report goes into the manifest and the release.
- **The npm runbook** (`docs/en/RELEASING.md`, French in `docs/fr/`): exact pins (Node 22.23.3, npm 11.21.0), a
  bootstrap by staged publishing of a reservation version, stage-only trusted publishing, the two-day window, the 2FA
  promotion, and the dual-use classification of the connectors (not declared; staged with a 2FA promotion anyway). A
  nightly job that does not gate watches that the four npm names stay free.
- **The candidate's baseline reads every job, and retries** (4.1.20): `tools/release/run-jobs.mjs` reads every page of
  the run's jobs (a candidate runs more than 100), retries a 5xx or a 429, and refuses a listing that does not add up
  to its `total_count`. It replaces the one bare `gh api …/jobs?per_page=100` call.
