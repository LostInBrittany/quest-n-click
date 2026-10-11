### Changes

- **A Field Kit bundle can be checked by someone who holds only the bundle** (4.1.19, schema 2). It now carries the
  candidate's manifest and that manifest's provenance attestation, which the candidate's gate signs from 4.1.19.
  `npm run field:verify-bundle` reads the archive itself under budgets: links, devices, `..` and absolute paths
  refused, at most 16 MiB a file and 64 MiB in all. It checks every file and the report against its candidate, then
  says who made the manifest: offline against a trusted root saved once, or online by the attestation and the run read
  now.
- **Bundled evidence keeps the path its report names** (4.1.19): 4.1.18 wrote `evidence/evidence/…`.
- **Evidence is bounded** (4.1.19): `field:check` says when a file or a report's evidence passes what a bundle may
  carry.
- **FIELD (en/fr) says the leak scan is a hygiene barrier, not a proof** (4.1.19).
- **`ship` and the Field Kit share one provenance contract** (4.1.19, `tools/release/provenance.mjs`): the manifest
  read strictly, digests, attestation (offline or online) and the run.
