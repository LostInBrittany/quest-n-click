### Changes

- **Every surviving mutant of the terminal connectors read** (4.1.20): the 113 survivors of `connectors-edge` in
  `connectors/src/ssh/connector.ts` (44), `terminal/shell.ts` (32), `telnet/connector.ts` (25) and `terminal/guard.ts`
  (12) were read one by one. 111 are killed by `tests/connectors-terminal-edge-mutants.test.ts`, which checks the
  address gate and the session guard at each bound, the resume words and their bound of 10,000, every branch of the
  virtual shell, Telnet negotiation byte for byte, and both servers' authentication, sessions, closes and refusals,
  against fake sockets and fake ssh2 connections. The other 2 are named in `docs/dev/mutants.json`: 1 equivalent and 1
  unreachable.
