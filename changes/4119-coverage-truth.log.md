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
- §8.4: `scripts/lib/archive-harness.mjs` gives each step an id and a duration, and a failure the command that
  reproduces it. `ops-qualify` is split in PR 5, which extends it.
- §8.5, flakes:
  - `sshKeyPair()` signs with the private half and verifies with the public one, and keeps a refused pair under
    `.cache/flakes/`;
  - e2e browser errors carry their kind, name, message, stack and page, and a console error's location and arguments;
  - `reality-xcheck` warms Biscuit's WebAssembly and times each verdict, and a timeout says it was a time limit.
    No budget was raised.

→ next: Claude · PR 5 (the qualification profile), then PR 6 (README, docs, release)
