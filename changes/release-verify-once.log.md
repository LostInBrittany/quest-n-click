## a resumed release command verifies the release once

4.5.4's `npm run release -- 4.5.4` was run again after the phone that held the npm 2FA died, and the rerun redid
`ship verify 4.5.4` (the download, the sums, the attestations, `gh release verify-asset` on each of 35 files), about 5
minutes for a release verified minutes before (#343). `verifyOnce` replaces the call: it reads `verifiedState` (the
release from `gh api repos/<repo>/releases/tags/v<v>`: its id, `immutable`, each asset's `digest`; the tag object and
its commit from `git ls-remote`), and `verifySkip` skips only when a record of a passed verify holds exactly that state,
every asset has a digest and the release is immutable, and `--reverify` was not given; each other case runs the verify
and says why. The state is read before and after the verify, and the record
(`.cache/release/v<v>.verified.json`, beside the download folder, since `ship verify` refuses a file its manifest does
not list) is written only when the two match. An immutable release's assets and tag cannot change once published, so
the bytes verified are the bytes served; the digests are compared anyway. Run on v4.5.3's real API and ls-remote
output, the state reads 35 assets with digests, immutable. `ship verify` and release.yml are unchanged. Not in scope:
`npm stage approve` does not compare a staged package with the release's tarball (release.yml's `npm-stage` stages
the very archives the release carries, checked against its SHA256SUMS). The releasing page (en, fr) says it.

→ next: 4.5.5's release, whose resumed runs skip a verify already passed.
