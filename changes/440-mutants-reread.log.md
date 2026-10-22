## 4.4.0: the 137 mutation exemptions read again (4 killed, 2 bugs fixed, 133 to 4.5.0)

- Every entry of `docs/dev/mutants.json` was due at 4.4.0. Four reviewers read them against origin/main 829d1126 (one
  context per quarter, read-only), then each verdict was checked again here. Each kill's test sits in a file the
  entry's set runs, checked by hand to fail with the mutant applied and pass without it.
- Killed: `reality-runtime.ts` the binding's `&&` (`reality`, tests/reality-engine.test.ts: a delivery without a
  player, or with `playerId: ''`, binds nothing; with `||` the save held `playerId: ''`, which the save schema
  refuses); `bridge.ts` the re-sign cache's hit (`reality`, tests/bridge.test.ts: `signSignalSync` spied, a hit signs
  nothing; the test's own comment was wrong, a scan wider than the cache misses all three, not two);
  `badges/fetch.ts` the request's `timeout` answering `ok: false` (`connectors-pure`, new
  tests/connectors-badges-timeout-mutants.test.ts: the socket's idle timer is armed in the request's constructor,
  before the whole-exchange timer, so a connect that never completes fires it first; the old reason said the
  opposite); `oidc.ts` verifyLogoutToken's `&&` (`studio-auth`, tests/studio-oidc-mutants.test.ts: `events: null`).
- Fixed: `http-port.ts` `sleep` removes its abort listener when the wait ends on time (tests/reality-port.test.ts
  counts them over twenty polls; the `once` entry is equivalent again, its context line updated);
  `email/mime.ts` `htmlToText` lowers ASCII only, so `lower` keeps `html`'s indexes (tests/connectors-mime-mutants:
  İ before a script, a comment, inside a style).
- Kept, reason rewritten (16): `runs.ts` seedKind ×2 and `answer` ×2, `runs-store.ts` toRun, `envelope.ts`
  worldEvidence, `verify.ts` the links count, `compile.ts` ×2 (a null command throws in eachCmd anyway),
  `restore.ts` the deletes without --force (only a row committed in between by another connection, Postgres READ
  COMMITTED, would differ), `ssh/connector.ts` parseKey may answer undefined too, `durable.ts` ×2, `oidc.ts`
  `idTokenExpected` (openid-client sets it itself for a string nonce), `backup.ts` row order, `http-port.ts` sleep.
- Per set, kept / killed / fixed: core 3/0/0, reality 15/2/1, runs 20/0/0, speedrun 9/0/0, remix 15/0/0,
  connectors-pure 11/1/1, connectors-edge 14/0/0, reality-store 7/0/0, reality-store-postgres 1/0/0 (read by
  argument, no database here), studio-ops 12/0/0, studio-auth 9/1/0, studio-workshop 10/0/0, voices 7/0/0.
- Left as is, by choice: four entries (`runs.ts` ×2, `runs-store.ts` toRun, `envelope.ts`) differ only by an own key
  set to undefined that no reader tells from an absent one; pinning object shapes was not worth four tests.

→ next: the mutation sets run on the branch in CI; the remaining 133 are read again at 4.5.0.
