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
- Second reading (sub-agent, 13 Oct): no P0 or P1; it repeated the red check itself (each test red for its own reason,
  never only vitest's handler). Folded in:
  - the same class in `ssh/connector.ts`: `void bindPlayer(...).then(...)` had no catch; a pairing that throws now
    refuses the login;
  - Telnet pauses each socket in `stop()` rather than reading a connector-wide flag, which `start()` reset;
  - the 503 answer carries `since`, as every health answer does;
  - an inline `bridge.token` that is not a string is refused too (it bypassed `readSecret`);
  - `config.ts` claimed CONNECTORS.md named the inline shortcut: both docs (FR in French) now say it, and the 503.
- Tests: 9, the 3 added ones red on the first commit, all 9 red on main.

→ next: CI, merge; then the technical candidate.
