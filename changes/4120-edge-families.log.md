## 4.1.20 PR 2b–2e: connectors-edge read and gated

- Plan §7.5. The four families (2b badges #115, 2c email #116, 2d terminal #117, 2e the rest) were joined into one
  branch, so that the generated files (`docs/dev/mutants.json`, `MUTANTS.md`, the ratchet, the READMEs' figures) are
  resolved once and checked by one CI run.
- The four families' 488 survivors: 469 killed (193, 108, 111, 57) and 19 named (4, 8, 2, 5), each mutant applied and
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
