### Fixed

- **A badge proof signed with an RSA key is refused (4.3.0)**: an `eddsa-jcs-2022` proof is checked with an Ed25519
  key only. The key comes from the issuer's document, which may give an RSA or EC one, and an RSA-512 key, whose
  signature is exactly 64 bytes, made a proof the badge connector took as valid. Such a proof is now `invalid`.
- **The Bridge checks its limits before it starts (4.3.0)**: each of `config.json`'s `limits` (`resignedCache`,
  `streamPage`, `pendingPairings` and the others) must be a non-negative integer, and a name that is no limit is
  refused. Before, any value was taken: `resignedCache: -1` left the re-sign cache's eviction loop held off by a single
  guard. A Bridge given such a value does not start, and says which limit and what it was given.
- **A run whose world cannot be hashed is refused, not a crash (4.3.0)**: a `.wsrun` whose world holds a number JSON
  reads as Infinity (`1e400`), or two keys equal once NFC-composed, is `invalid-replay` / `world-shape`; the verifier
  answered `inconclusive` / `crash`. Loading such a stored world says the same.

### Changes

- **The 158 mutation exemptions read again (4.3.0)**: each entry of `docs/dev/mutants.json` came due at 4.3.0 and was
  checked against the code. 27 were not what they said and are now killed by a test; three led to the fixes above and
  stay, their reason rewritten. The other 128 keep their place with a reviewed reason, and every entry now names its
  line and is read again at 4.4.0. 131 remain.
