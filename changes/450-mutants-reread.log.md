## 4.5.0: the 132 mutation exemptions read again (5 killed, 127 to 4.6.0)

- Every entry of `docs/dev/mutants.json` was due at 4.5.0. Five reviewers read them against origin/main b3b54cdf (one
  context per group of sets, read-only), then each verdict was checked again here. All 132 had survived the 4.4.0
  candidate's full run (39844438395); only `previews.ts` changed among the exempted files since, and its two entries
  hold. Each kill's test sits in a file the entry's set runs, checked by hand to fail with the mutant applied and pass
  without it.
- Killed: `envelope.ts` sealEnvelope's `o.world.evidence ?` forced true (`speedrun`, tests/speedrun-envelope-seal: the
  in-memory envelope a `sealed` listener and the speedrun UI hold; 4.4.0 had left such own-undefined keys as is, but
  this one is public); `journal.ts` withLease's `until_ms > t` → `>=` (`studio-ops`, tests/studio-journal-mutants: the
  old why said the database clock could not be staged, the suite already stages it); `durable.ts` writeDurable's
  string test forced false and `===` → `!==` (`studio-ops`, tests/studio-durable-mutants: on a short write the text
  given to writeSync as is would be written again whole at the offset; the mock now cuts the string overload too);
  `health.ts` judge's `rev > head` forced false (`studio-workshop`, tests/studio-workshop-health-mutants: `bisect` is
  public).
- Wrong, corrected: `badges/crypto.ts` ed25519Key's length guard (createPublicKey accepts the SPKI header followed by
  33 or 64 bytes, so the guard is not redundant with the DER parse; the mutant stays unreachable through multikey).
- Sharpened (19): session-runtime `chosen`, http-port stream relay `once`, runs.ts `out.seedKind` and `r.verdict`,
  runs-store claimNext's tie, recorder digests, apply.ts ×2, compile.ts ×4, imap.ts `dead`, ssh parseKey, store.ts
  Sealer.open ×4, builds.ts `rebuilt`.
- Per set, kept / killed: core 3/0, reality 15/0, reality-store 7/0, reality-store-postgres 1/0, runs 20/0, speedrun
  8/1, remix 15/0, connectors-pure 11/0, connectors-edge 14/0, studio-ops 8/3, studio-auth 9/0, studio-workshop 9/1,
  voices 7/0. `docs/dev/MUTANTS.md` gains a table of the rereads; `tests/mutants-json.test.ts` checks the entries at
  4.5.0 and its pre-releases.

→ next: the mutation sets studio-ops, studio-workshop and speedrun measured on the branch; the 127 are read again at 4.6.0.
