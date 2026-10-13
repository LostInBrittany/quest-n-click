## 4.1.20 PR 2b–2e: connectors-edge read and gated

- Plan §7.5. The four families (2b badges #115, 2c email #116, 2d terminal #117, 2e the rest) were joined into one
  branch, so that the generated files (`docs/dev/mutants.json`, `MUTANTS.md`, the ratchet, the READMEs' figures) are
  resolved once and checked by one CI run.
- The four families' 488 survivors: 473 killed (193, 109, 111, 60) and 15 named (4, 7, 2, 2), each mutant applied and
  run against its family's new test file, no source changed.
- `connectors-edge` joins `GATED` (4 shards), `MEASURED` is empty, and the nightly's matrix measures nothing that
  gates nothing.
- Weaknesses noted by the families and left for a behavioural PR, none reachable under today's contracts:
  - a `void …finally` that would leave an unhandled rejection, in the badge connector, the email connector's `track`
    and the `/health` handler;
  - a numeric email secret accepted at start;
  - `ImapClient.open` leaves its socket open after a greeting that is not OK;
  - `TelnetConnector.stop()` reads one more second;
  - a non-numeric `Content-Length`, bounded by the streamed count anyway.

→ next: Claude · PR 3 (the candidate qualifies what it publishes)
- Second reading (subagent, 13 Oct): three "equivalent" arguments were false for a configuration file that nothing
  validates. They are now killed: an empty `tenantId` (the default, never `''`), an empty IMAP `mailbox` (INBOX), and a
  health "port" that is a socket path (`address()` is then a string: no health URL, the run goes on, rather than a
  throw on a URL with no port). Also from that reading:
  - the email tests stop every connector in `afterEach`, so a failed assertion leaks no server or poll loop;
  - ssh2's `parseKey` is pinned directly, since the SSH unreachable entry rests on it and ssh2 is a range;
  - the matrix test checks that the nightly equals the gated matrix while nothing is measured only;
  - the set comments and two whys were corrected.
  - Left for 4.2: an entry carries no line number, and five contexts match several lines (one in imap.ts, plus
    runs.ts, runs-store.ts, badges/fetch.ts and backup/restore.ts), so an entry also covers the same edit on its twin
    lines.

