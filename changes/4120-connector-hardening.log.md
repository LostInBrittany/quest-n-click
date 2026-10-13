## Connector hardening: the weaknesses the edge mutation families saw (#118)

- The families listed them as "seen, not changed" (none reachable under today's contracts), for a behavioural PR:
  - `void p.finally(...)` in the badge connector, the email connector's `track` and its IMAP tick: when `p` rejects,
    `finally` returns a promise that rejects too, and nothing catches it. Each one now ends in `.catch`; the request
    still answers with the rejection;
  - the `/health` handler awaited `connector.health()` in an async request handler: a throw now answers 503;
  - `readSecret` returned any truthy inline value, so a numeric `secret` reached `createHmac` and every request got a
    500. It is refused at start;
  - `ImapClient.greeting` refused a greeting that is not OK without destroying the socket. It now goes through `fail`;
  - `TelnetConnector.stop()` ended the sockets, but their data handler kept reading until they were destroyed.
- `tests/connectors-hardening.test.ts`: 5 tests, each red on the previous code (all 5 failed with the fixes stashed),
  green with them.

→ next: CI, second reading, merge; then the technical candidate.
