### Changes

- **Mutation sets named for what they mutate** (4.1.19).
  - `connectors` becomes `connectors-pure`: the SDK, the MIME reader, the line editor, the virtual disk, and the badge
    crypto and fetch. The old name still works until 4.2.
  - Two new sets, measured every night but gating nothing yet: `connectors-edge` (configuration, email, badge
    verification, the terminal's guard and shell, SSH, Telnet) and `reality-store-postgres` (the Postgres adapter).
  - MUTANTS, TOOLS and ROADMAP now say exactly what each set covers.
- **The four connectors are played from their archive** (4.1.19, `npm run connector-archive-e2e`, a candidate job):
  - email by webhook and by IMAP;
  - Telnet, with UTF-8 and an over-long line;
  - SSH, with a backspace, the virtual disk and a wrong password;
  - Open Badge, with a valid `did:key` credential, an invalid one and a private address refused.
- **The Vite configuration no longer loads the Studio** (4.1.19). The dev server loads the Studio itself, and the demo
  snapshot is built in a process of its own.
  - The configuration loads 7 modules besides itself, instead of the whole Studio and engine.
  - Vite's 500 warnings about imports without a file extension are gone.
  - Where Node strips types, the native configuration loader can load it.
  - The player's bundle is the same, byte for byte.
- **Known flakes are now observed, not retried blind** (4.1.19):
  - an SSH test key pair is checked whole, and kept when refused;
  - a browser error now reports its kind, stack, page and arguments;
  - Biscuit's first call is warmed up and each verdict is timed.
- `external-consumer` and the new archive script share `scripts/lib/archive-harness.mjs`. Each step has an id and a
  duration, and a failure names the step and the command that reproduces it.
