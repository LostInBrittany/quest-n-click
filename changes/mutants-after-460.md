### Fixed

- **The mutation sets pass again after #458, #459 and #460 (next)**: eleven survivors in code those three changed, in
  no test and in no entry of `docs/dev/mutants.json`, stopped five sets (`reality`, `runs`, `connectors-edge`,
  `studio-auth`, `studio-workshop`) in 4.7.2's candidate and in the nightly. Each is now killed by a short test: a
  player revoked while its proposal waits for the lock is refused as a player first; a purge naming no tenant purges
  every tenant; only a valid badge is claimed by its first player; the IMAP pass says once, and only when the server
  cannot, that it cannot expunge; a refresh already in flight is joined, and a definitive refusal keeps the claim; a
  form body of exactly its limit is read; and the collection keeps a blob read again at exactly its grace period.
