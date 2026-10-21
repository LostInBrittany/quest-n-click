## 4.3.0: the 158 mutation exemptions read again (27 killed, 3 fixed, the rest to 4.4.0)

- Every entry of `docs/dev/mutants.json` was due at 4.3.0. Four reviewers read each one against origin/main 8f3d5d3d:
  128 kept, 30 to kill. Each kill's test was written in a file the entry's mutation set runs, then checked by hand
  to fail with the mutant applied and pass without it. 27 entries were removed; 131 remain, all with `revisit: 4.4.0`,
  the reviewed `why`, and a `context` line (added to 0, 1, 4 and 29; idx 1's is `private chosen = false;`, so it no
  longer also covers `digestOn = false`; idx 4's no longer covers the four other `&&` of reality-runtime.ts).
- Killed, engine: `migrate.ts` step and active player renamed through a map key "undefined" (`critical-migrate`);
  `reality-runtime.ts` `fast: false` timed on the run clock (`reality-engine`); `protocol.ts` b64url's own alphabet,
  `fatal` UTF-8 header, non-extractable key (`reality-protocol`); `client.ts` the payload's padding at length ≡ 3
  (`reality-client`); `daily.ts` `fatal` (`remix-tokens`).
- Killed, Bridge: `lock.ts` an idle key forgotten (`bridge-mutants-tenant`); `store.ts` three lock attempts exactly
  (`bridge-lock-races`), parseLine quoting JSON.parse (`bridge`); `runs.ts` an answer written after the worker exited
  (`ended`, both mutants; new fake-worker mode `late`, `bridge-runs-worker`), a 429 with `retryAfterS: 0` has no
  Retry-After (`bridge-runs-http`); `runs-store.ts` a claim whose UPDATE changes no row, `runs-limiter.ts` a purge
  whose edge row is gone (`bridge-runs-store`, a SqlDb wrapper staging the other process); `store-postgres.ts`
  giveBack under two concurrent releases (`reality-store-postgres-mutants`).
- Killed, connectors: `email/connector.ts` tick's `stopping` guard after `start()` twice
  (`connectors-email-edge-mutants`). Making `start()` idempotent was left out: a start that fails half-way would need
  its own rollback, and the new guard's mutants their own tests.
- Killed, Studio Server: `journal.ts` the lease deadline's exact millisecond (`studio-journal-mutants`, Date.now held);
  `durable.ts` fsyncDir's catch and finally, four mutants (`studio-durable-mutants`, node:fs `openSync` mocked for the
  directory only); `auth/store.ts` a logout with `sid: ''` (`studio-store-mutants`); `leases.ts` check and list
  read-only under another process's write lock (`studio-leases-mutants`, a raw node:sqlite `BEGIN IMMEDIATE`);
  `health.ts` schedule after close while a judgement is in flight (`studio-workshop-health-mutants`).
- Fixed, kept: `badges/crypto.ts` `verifyEddsaJcs` refuses a key that is not Ed25519 (an RSA-512 key's 64-byte
  signature verified); the length check's mutant is equivalent again. `bridge/src/config.ts` `checkLimits`: the
  Bridge's limits are non-negative integers with known names; `bridge.ts`'s `oldest === undefined` guard is now
  `unreachable`, proved by `tests/bridge.test.ts`. `remix/compile.ts` `loadVariant` turns canonicalJson's refusal into
  a `world-shape` RemixSeedError (the reviewer asked for world-shape; done at the source rather than in the verifier,
  so a real bug still answers `crash`); `verify.ts`'s `instanceof` mutant is equivalent again.
- Sets touched: core, reality, runs, remix, speedrun, connectors-pure, connectors-edge, reality-store-postgres,
  studio-ops, studio-auth, studio-workshop.

→ next: the mutation sets run on the branch in CI; the remaining 131 are read again at 4.4.0.
