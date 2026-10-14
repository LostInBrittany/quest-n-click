### Changes

- **A people's pass is bound to its surface** (4.1.20, ADR 0024). `docs/dev/surfaces.json` says what each of the
  thirteen passes reads: the candidate's files (the built site file by file), the checkout's configuration (the
  README's install section, now between generated markers in both languages) and the passes it depends on. Each
  exclusion has its reason and a test. The candidate writes and attests `qualification-surfaces.json`, and a file in
  no surface fails it.
- **The candidate builds the site once, and the release publishes it** (4.1.20): its archive, its assets manifest and
  the SHA-256 of every file it serves (`site-files.json`). `release.yml` publishes them, with the surfaces, and builds
  no site to publish.
- **`npm run field:carry`** (4.1.20) carries a pass to a new candidate when no file of its surface changed, the version
  included. It writes a `pending` CarryAttestation beside the person's report, which is never rewritten. The
  maintainer approves it in a commit signed with their key, judged by `.github/allowed_signers` as the source
  candidate holds it. `field:check` and `field:report` then count it as passed. `ci` refuses a pull request that
  changes the trust root together with an attestation.
