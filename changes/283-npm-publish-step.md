### Changes

- **The npm packages are staged by each release, for an owner to approve** (4.5.2, D34, #283). Once a release is
  published and read back, release.yml's new `npm-stage` job takes the five archives the release carries (checked
  against its `SHA256SUMS`) and stages them on npm by trusted publishing: OIDC, no token, a provenance, engine first,
  `latest` for a stable tag. A version already published or already staged is skipped, so the job can be re-run alone;
  a missing trusted publisher fails it with the `npm trust github … --file release.yml --allow-stage-publish` command.
  The run summary lists the ids and the `npm stage approve <id>` an owner of the organisation runs with 2FA, in order.
  Nothing is ever published by CI. A pre-release tag stages nothing (its archives carry the stable version): it
  rehearses the OIDC exchange by a dry run. `docs-publish` does not wait for it.
- **`ship preflight-stable` reads the staging step** (4.5.2, #283): a trusted publisher counts only on `release.yml`,
  its hint says the configuration expires unless it stages within two days, and a new `publish-step` row checks that
  release.yml stages through `tools/release/npm-stage.mjs`, never `npm publish`, never a token.
