### Fixed

- **A tenant's run retention deletes its own runs only** (next): on a Bridge serving several tenants, each tenant's
  hourly purge kept another tenant's runs younger than that tenant's own `retentionDays`; a short retention on one
  tenant no longer empties the others' leaderboards.
- **An acknowledgement never brings a revoked or forgotten player back** (next): `POST /v1/ack` now renews only the
  link's expiry of a player still held and not revoked, and the operator's revoke and the player's unlink change only
  the `revoked` mark, so a revoke or a deletion landing at the same moment on another instance stays done.
- **A signal is never written for a player revoked or deleted meanwhile** (next): the store reads the player again
  inside the transaction that writes the signal; a proposal racing a revoke or a deletion on another instance is
  refused with 404 and leaves no row.
- **An event stream whose client leaves while it opens is let go** (next): such a stream no longer stays counted
  against the player's `streamsPerPlayer`, so repeated drops during the setup no longer end in a 429 for that player.
- **The Mystery commit quota holds across instances** (next): on a SQL store, `commitsPerHour` is counted in the
  database for every instance of the tenant, as the runs' quota is, instead of once per process (a bucket of three
  refilled over the hour; the memory store keeps its rolling hour).
- **The per-address rate limits key IPv6 by its /64** (next): an IPv6 client counts as one address for its whole /64,
  and the tables of addresses are swept at most every 10 seconds instead of on each new address once they are large.

### Changes

- **A per-address limit on pairing codes** (next): `limits.pairingsPerAddress` (default 5) is how many codes one
  address may ask per 10 minutes, per tenant; beyond, `POST /v1/pairings` answers 429 with `Retry-After` for that
  address only, so a few addresses can no longer fill `pendingPairings` for every player. A host pairing many players
  from one address (a test, a kiosk) raises it in its `config.json`.
