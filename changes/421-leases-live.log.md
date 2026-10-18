## 4.2.1 PR 6: spans, leases and the live stream

Branch: feature/421-leases-live (stacked on PR I) · Plan P2, P7, §5, §3.6

- **`studio-server/src/ops/spans.ts`:** the span of every game file (rooms, languages, story, items, cast, rules,
  voices, assets, notes, meta, playtests, reality); a file no rule names is refused (422). A test walks every game of
  the repository.
- **`studio-server/src/server/leases.ts`** (migration 0004 `studio_spans`): claims all or none, never waiting, in a
  fixed order, on the database's clock, in the journal's intent transaction (`JournalOptions.claim`); fences that
  only grow; heartbeat renewal; release; owner takeover; the exclusive lease `*`; optional client fences
  (`x-studio-fences`).
- **`studio-server/src/server/live.ts`:** presence (heartbeat, 60 s) and `GET /api/events` (SSE: hello, revision,
  leases, presence, ping), closed on the revocation bus, at a Bearer's end, and by a 30 s check of the credential.
- **`journal.ts`:** `claim` hook and `confirmed` events after each commit. **`http.ts`:** `/presence`, `/leases`,
  `/leases/release`, `/leases/takeover`, `/exclusive`, `/exclusive/release`, `/events`; undo and redo refused
  (409) on a shared Studio. **`main.ts`:** leases and presence with OIDC.
- **Tests:** `tests/studio-collab.test.ts`, 12 cases:
  - three devs, a reviewer and an owner against the test provider: 423 naming the holder, expiry, the heartbeat,
    takeover with fences and the audit, the exclusive lease, undo refused;
  - the stream: revisions with spans, presence, closing on removal within 5 s and at a Bearer's end;
  - races of ten claims on SQLite and on Postgres (`STUDIO_TEST_PG_URL`).

- **Second reading** (automated second context): one shared hub reads the leases once per change for every stream
  (coalesced, numbered, errors caught); `hello` first; a stream too far behind is closed; the 30 s check does not move
  the session's idle clock, and a cookie stream closes at the session's expiry; a removed member's leases and presence
  go at once; leases are checked before the guard; a shared Studio refuses a write that names nobody; what the
  exclusive lease covers today is said as it is.

→ next: Claude (PR 7, the client)
