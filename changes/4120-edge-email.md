### Changes

- **Every surviving mutant of the email connector read** (4.1.20): the 116 survivors of `connectors-edge` in
  `connectors/src/email/connector.ts` (70), `imap.ts` (40) and `parse.ts` (6) were read one by one. 108 are killed by
  `tests/connectors-email-edge-mutants.test.ts`, which checks the configuration, each refusal's exact reason, the sender
  links and their bound of 10,000, the webhook's answers, the IMAP pass (sizes, flags, retention, its timer) and every
  bound of the IMAP client byte for byte, against an in-memory IMAP peer. The other 8 are named in
  `docs/dev/mutants.json`: 5 equivalent and 3 unreachable.
