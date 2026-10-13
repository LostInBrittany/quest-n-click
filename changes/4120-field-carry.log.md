## 4.1.20 PR 4: surfaces and carry attestations (ADR 0024)

- Plan §9, D35. Stacked on PR 3 (its manifest of artifacts).
- The site moves to the candidate: `release-core` keeps the build `release-check` made (`candidate-site`: dist.tar.gz,
  assets-manifest.json, site-files.json). The gate puts it in the manifest, and release.yml publishes it instead of
  `tar -czf dist` (release-check still builds one, to check). Without it, a site pass could not be bound to the files
  it served.
- Surfaces:
  - every site pass reads the whole site, `og.png` excepted;
  - its exclusion is proved by vite.config.ts's precache patterns, none of which matches it;
  - the voices read the audio, the bundle, index.html and site.json;
  - the Bridge and connector passes read the Bridge's archive, the image (and the connectors') and ops/qualify;
  - the archive pass reads the four archives and `readme:install`;
  - baselines, SBOMs, runs and the check's report are `status`, each with its reason.
- The trust root, checked with real ssh-keygen keys and git signatures in temporary repositories:
  - a key added after the source candidate is refused;
  - an unsigned commit, or an edit after the signature, is refused;
  - a merge that rewrites the file is refused;
  - a signed commit brought by GitHub's unsigned merge is accepted;
  - a range that changes the root and an attestation is refused, but the root with the folder's README only is not
    (PR 4 itself brings both).
- **Left for the maintainer:** the first `.github/allowed_signers` (`id_ed25519_sk`), in a commit signed by that key,
  in this pull request, merged with a merge commit. Claude cannot sign it.
