## 4.1.20 PR 2b: the badges' mutants read

- Plan §7.1, the Open Badge family of `connectors-edge`. The input was the 197 survivors that `tools/mutate.ts
  --set=connectors-edge` measured on aa2462e: 168 in `badges/verify.ts`, 29 in `badges/connector.ts`. The badge
  sources are unchanged on this branch.
- One new file, `tests/connectors-badges-edge-mutants.test.ts` (51 tests). Documents come from a map, the keys come
  from fixed test seeds, the clock is fixed, and the one fetch through the real SafeFetcher goes to a local server
  on port 0. It pins:
  - the reason of each refusal, not only its status, since many mutants turn an `invalid` into another `invalid`,
    or into a TypeError caught as `indeterminate`;
  - the exact bounds: `maxFetches`, depth 8, `validFrom` + skew, `validUntil`, JWT `exp` and proof `expires` at the
    very instant, status index 0, -1 and 128, and the cache's TTL and 256 entries;
  - each shape: `vc`-wrapped or bare JWTs, `iss`/`jti`, `verify` and `HostedBadge`, embedded badge classes, a proof
    among several, keys as a JWK, a wrapped JWK or a multikey, and status lists as a Data Integrity document or a JWT;
  - the form: 404 not counted, 400 and 429, a refused pairing, the email and recipient bounds (320, 512), no signal,
    the badge id in the proposal, refused and duplicate proposals, 503 and health without the context, the testing
    policy and resolver handed to the fetcher, and a body cut by the client counted as `internal`.
- Each kill was checked by a scratch script that built every mutant with `mutants()`/`apply()`, ran only the new
  file, and restored the source. 193 of the 197 failed it. `verify.ts:134`, with the same line as `:147`, also
  fails it since the tampered VC-JWT test. Both sources are byte-identical to their backups.
- Named as equivalent (4): `verify.ts` `typeof d.kty === 'string'` → true and `isObj(d.publicKeyJwk)` → true, where
  `jwkKey` answers null either way; and `connector.ts` `this.c.testing` → true and `this.c.resolve` → true, which
  `SafeFetcher` reads through `?.` and `??`.
- Seen, not changed: `connector.ts` drops the `work.finally(...)` promise with `void`. If `submit` ever rejected, the
  rejection would be unhandled. It cannot today: `ctx.pair`, `ctx.propose` and `verify` never throw by contract. A
  test whose `pair` threw showed it, and was replaced by the cut-body test.
- No mutation set changes. `connectors-edge` enters `GATED` in PR 2e.

→ next: Claude · PR 2c (connectors-edge, email)
