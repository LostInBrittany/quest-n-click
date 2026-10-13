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
- Second reading (subagent, 13 Oct, with a git/ssh probe). Fixed:
  - **P0: an attestation named its own trust root.** A branch added a key to allowed_signers, removed it, and signed
    an approval with it whose `from.commit` was the first commit. The net diff held no key change, and the principal
    is free text. Now:
    - the source commit must be on the first-parent line of the history judged (main's);
    - the range check reads every commit, not the net diff;
    - the source report must be the attestation's pass on its `from` candidate, and be signed by the same principal.
  - Committed bytes only: a working-tree edit counts for nothing.
  - A carry fills only a pass not tried on the target: a failure there is never covered.
  - Every commit on a carry's path is the maintainer's: documented in the ADR, FIELD (EN and FR), the folder's README
    and field:carry's message.
  - Smaller fixes:
    - `**/` matches the root as workbox does, so the og.png proof is no longer vacuous;
    - the voices surface also reads the root scripts (the service worker), `data/` and CSS;
    - the merge check reads git's exit status;
    - a malformed attestation, or a folder without its site files, is said and does not crash;
    - one file per pass, named by its id;
    - the gate refuses a candidate with no site before it attests anything.
  - Each new test was run against the code before the fix and failed there.
  - Left as is: release-core's field:check runs on a shallow checkout, so a carry it lists there says "no trust root".
    That is information only: counting a carry needs main's history, as in `field:check --require` on main.
