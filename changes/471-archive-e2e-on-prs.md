### Changes

- **A pull request that touches a connector or the Bridge plays the connectors from their archive (next, #471)**:
  the `connectors` job runs `connector-archive-e2e` on the archives it has just packed – the four connectors against
  a Bridge from its own archive, a fake IMAP server included, about ten seconds. Until now only the candidate ran it,
  so #459 and #460 (the email connector's UIDPLUS and `UID EXPUNGE`, the Bridge's `limits.pairingsPerAddress`) were
  merged green and 4.7.2's first candidate failed on them. The candidate still runs it on the archives it ships. The
  plan now opens the `reality` gate for `scripts/connector-archive-e2e.mjs`, `scripts/npm-install.mjs`,
  `scripts/lib/archive-harness.mjs` and `scripts/pack.mjs`, which fell to rules that did not: #466, the script's own
  fix, ran no connectors job.
