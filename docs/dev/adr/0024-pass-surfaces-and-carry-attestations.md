# 0024 · A pass is bound to its surface, and carried only by a signed attestation (4.1.20)

**Context.** Since 4.1.18 a people's pass is bound to a candidate run: its commit, its run and the SHA-256 of every file
the candidate judged. That is safe but coarse. Fixing a sentence of the README would void a Safari pass, a voice
listening or 48 hours of deployment. Carrying a pass blindly would be wrong too: the package version enters the IR,
`site.json`, the bundle and the speedrun packages, so it is not a neutral change.

**Decision** (D35, plan §9).

1. **A surface per pass.** `docs/dev/surfaces.json` declares what each of the thirteen passes reads.
   - The candidate's files, by their path in its manifest. The built site counts file by file (`site:<path>`, from
     the candidate's `site-files.json`): the candidate now builds the site once and publishes it, and release.yml
     builds no site of its own.
   - The checkout's configuration it reads. `readme:install` is the README's install section, between generated
     markers in both languages.
   - Its exclusions. Each one has a reason and a test that proves the surface does not read it (for example `og.png`,
     which only link previews fetch).
   - The passes it depends on.
   - Every candidate file is in a surface or under `status`, with a reason. A file in neither fails the generation.
2. **The surfaces are attested.** The gate writes `qualification-surfaces.json` (tools/field/surfaces.mjs) before
   the manifest, so the manifest's provenance attestation covers it. The version is relevant by default: nothing
   normalises it away.
3. **`FieldReport` is untouched.** It keeps four statuses. A carry is a separate object, `CarryAttestation`
   (tools/field/carry.ts). It holds the source report's digest, the source and target surface digests, the exact list
   of files that changed elsewhere and its digest, a `decision` (`pending`, `approved`, `refused`) and `approvedBy`.
   `field:carry` writes it `pending`, beside a byte-for-byte copy of the source report, and refuses any relevant
   difference. There is no force.
4. **Approval is a signature, not a review.** The maintainer sets `approved` and `approvedBy` in a commit signed with
   their hardware key (`id_ed25519_sk`). tools/field/trust.ts checks it:
   - The trust root is the repository's `allowed_signers` (under `.github/`, added by the maintainer) as the **source
     candidate's commit** holds it, never as the commit that brings the attestation. A pull request cannot add a key and sign with it.
   - Every commit that wrote the attestation, through merges that were not squashed, must be signed by a key of that
     root. A signed merge does not cover an unsigned commit. A merge itself (GitHub signs it with its own key) is
     left out, but the file at HEAD must be the bytes the last signed commit wrote.
   - No commit that writes the attestation may touch the root. A range (a pull request) that changes both is refused
     (`field:carry --check-range`, run by `ci` on every pull request).
   - `approvedBy` must be the principal the root names for the signing key.
   - A key rotation is its own pull request, then a candidate that attests it, and holds from that candidate on.
5. **Counted, not rewritten.** `field:check` and `field:report` count a carried pass as `passed` for the target
   candidate only when its attestation is approved and trusted, its source report is the bytes it names and `passed`,
   and its target surface is the candidate's own. The target's own report stays as the person left it. Between an RC
   and its stable on one SHA and one run there is nothing to carry.
6. **Claude never writes an `approved` attestation.** There is no required CODEOWNERS review: the maintainer is the
   only collaborator. The guarantee is the signature, which Claude cannot produce.

**Consequences.**
- A README-only change carries the PWA pass, because the README is no file of its surface. A change to the service
  worker refuses the Safari pass. A change to the Bridge's archive refuses the Bridge pass, and a change to the mixing
  refuses the voices.
- The version alone refuses the PWA, Mystery, resumed-run, speedrun and archive passes (tests/field-carry.test.ts).
- The surfaces are coarse where proof is missing: every site pass reads the whole site, apart from proved exclusions.
  Narrowing a surface needs an exclusion and its test.
- The image of the Bridge is in the Bridge and connector surfaces. If its build is not reproducible, those passes are
  never carried: run again.
- PRs that bring `allowed_signers` or an attestation are merged with a merge commit (`ship merge` uses `--merge`). A
  squash or a rebase would recreate the commits under GitHub's key, which the root refuses.
