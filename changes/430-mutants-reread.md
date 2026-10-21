### Fixed

- **A badge signed with a weak or foreign key is refused (4.3.0)**: the badge connector takes the key from the
  issuer's documents, and the algorithm's name said nothing of its strength. An `eddsa-jcs-2022` proof is now checked
  with an Ed25519 key only (an RSA-512 key, whose signature is exactly 64 bytes, made a valid proof); a JWS (an OB3
  JWT, an OB2 signed assertion and its `publicKeyPem`, a status list) signed RS256 needs a modulus of at least 2048
  bits, and ES256 a P-256 key. A 512-bit RSA key can be factored, so a badge it signed could be forged. Such badges
  are now `invalid`.
- **The Bridge checks its limits before it starts (4.3.0)**: each of `config.json`'s `limits` must be an integer, at
  least 1 for `streamPage`, `bodyBytes` and `streamBufferBytes` (`streamPage: 0` made a fetch by cursor loop forever)
  and at least 0 for the others, and a name that is no limit is refused. Before, any value was taken. A Bridge given
  such a value does not start, and says which limit, the least it takes and what it was given; on a shared Bridge
  that stops every tenant (UPGRADING §39 says how to look first).
- **A run whose world cannot be hashed is refused, not a crash (4.3.0)**: a `.wsrun` whose world holds a number JSON
  reads as Infinity (`1e400`), or two keys equal once NFC-composed, is `invalid-replay` / `world-shape`; the verifier
  answered `inconclusive` / `crash`. Loading such a stored world says the same.

### Changes

- **The 158 mutation exemptions read again (4.3.0)**: each entry of `docs/dev/mutants.json` came due at 4.3.0 and was
  checked against the code. 28 were not what they said and are now killed by a test; two led to the fixes above and
  stay, their reason rewritten. The other 128 keep their place with a reviewed reason, and every entry now names its
  line and is read again at 4.4.0. 130 remain.
