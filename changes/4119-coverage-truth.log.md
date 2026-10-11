## 4.1.19 PR 3: coverage said exactly, the connectors from their archive, Vite's configuration, the flakes

- DSL admission (plan §2.3), closed before this branch was made:
  - accepted: none
  - deferred: none
  - rejected: none
  - reserved ADR 0022: unused
  - window: closed. No proposal came from the maintainer. A need found later goes to 4.2.x or 4.3, unless the
    maintainer reopens the window.
- §8.1, mutation sets:
  - `tools/mutation-sets.ts` takes `connectors-pure` as the canonical name. `ALIASES` maps `connectors` to it, and
    `setNamed` resolves it in `mutate.ts` and the vitest configuration.
  - The workflows use the canonical name. `release.yml` uses the old name for a tag older than 4.1.19.
  - `MEASURED` holds `connectors-edge` and `reality-store-postgres`. They run every night (`continue-on-error`,
    Postgres as a service) and on demand; `mutation.yml` now has a Postgres too.
  - MUTANTS.md lists each set, the files it mutates and whether it gates, and a test holds it to `SETS`.
- §8.2, connectors from their archive: `scripts/connector-archive-e2e.mjs` and the candidate's
  `connector-archive-e2e` job. The Bridge and the connectors are installed from their archives:
  - email by webhook, and by IMAP against a server in Node of the script's own;
  - Telnet: pairing, a command, an unknown command, UTF-8 with a stray byte, an over-long line;
  - SSH: a wrong password, the pairing code as password, a backspace, a file read, a path outside refused;
  - Open Badge: an OB3 credential from a `did:key` issuer verified offline, one for someone else, a private address.
  - A redirect and a DNS change at a public issuer cannot be reached from the archive, by design: they stay part of
    pass #79.
- §8.3, Vite: the Studio's plugin loads the Studio through `server.ssrLoadModule`; `StudioError` moves to
  `tools/studio/errors.ts` and is matched by its status. The demo snapshot is written by a child `tsx`.
  - The 27 imports still in the graph name their `.ts`, with `allowImportingTsExtensions`.
  - Measured: from 500 warnings to 0 and 11 dependencies. The native loader loads the configuration under
    `--experimental-strip-types`. The 44 JavaScript files of the player's build are byte-identical to main's.
  - `tests/vite-config-graph.test.ts` holds this.
- §8.4: `scripts/lib/archive-harness.mjs`, shared by `external-consumer` and the archive e2e, gives each step an id
  and a duration, and a failure the command that reproduces it. `ops-qualify` is split in PR 5, which extends it.
- §8.5, flakes:
  - `sshKeyPair()` signs with the private half and verifies with the public one, and keeps a refused pair under
    `.cache/flakes/`;
  - e2e browser errors carry their kind, name, message, stack and page, and a console error's location and arguments;
  - `reality-xcheck` warms Biscuit's WebAssembly and times each verdict, and a timeout says it was a time limit.
    No budget was raised.

- The second reading (an automated second context) found these defects, all fixed:
  - **The engine's own imports given `.ts` broke type-checking in game projects**: a generated project's tsconfig
    does not allow `.ts` import paths. `gameIR` moved to `tools/game-ir.ts`, so the configuration no longer reaches
    the engine's compiler. `src/engine` is untouched, and the configuration has 7 dependencies and no warning.
  - **`mutation.yml` gave every set a Postgres**, which changed how its mutants were judged. Only
    `reality-store-postgres` gets one now.
  - **That set was judged by too few tests**: it is now judged by every test that runs the adapter, and `mutate`
    refuses to measure it without a database.
  - **The archive e2e did not use the shared harness**: it now does. A failure prints the end of every process log.
  - **Badge verdicts were not checked at the Bridge**: each one is now read in the Bridge's journal.
  - **The SSH wrong-password check accepted any error**: it now requires an authentication failure.
  - **The IMAP password was never checked**: the IMAP server now checks it, and a duplicate letter was added.
  - **`StudioError` was matched by its status alone**: it is now branded, with the status bounded to 400–599.
  - **The snapshot's stdout went into a buffer**: it is now ignored.
  - **The flake evidence never left the runner**: the connectors job now uploads it.

→ next: Claude · PR 5 (the qualification profile), then PR 6 (README, docs, release)
