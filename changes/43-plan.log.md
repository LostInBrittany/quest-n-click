## "Studio Server" (4.2.1 → 4.2.3): the plan, ADR 0025, D39, D40, D41 — hosted behind OIDC

Branch: docs/43-plan (#127) · Base: a0ce19d (v4.2.0)

- **The maintainer's request (17 Oct):** a platform where several developers connect to one server, at the same time,
  each on a part of the scenario, and build the shared work together (D39). A first, Git-native proposal (one local
  Studio each, pull requests) was off-target. Of the two shared shapes, they chose one live copy with explicit locks
  over private workspaces.
- **Their reading of the second proposal** brought the plan's three steps (§5) and its principles (§3):
  - the transaction as the unit of change;
  - one write owner, with fenced leases;
  - one validation guard on the final state;
  - an explicit per-revision preview;
  - a revision on every diagnostic and build;
  - durability and a single entry from the first step.
- **Checked against the tree (§1.1).** About ten paths write to `games/`: core, assets, the MCP process, TypeScript and
  Python authoring tools, and `POST /__layout`. Only `setValue` and `setLayout` are guarded. Also:
  - no fsync;
  - Bridge leases have no fencing;
  - the save envelope is strict and has no content fingerprint;
  - validation runs the content's TypeScript.
- **Second automated reading context, on revision 1:**
  - **P0:** recovery could not roll back from hashes alone. It now rolls forward, with a content-addressed blob store.
  - **Twelve P1s, all taken into revision 2 (plan §9):**
    - ownership is decided by file, with an exclusive mode;
    - 409 is checked per file;
    - leases go through the queue;
    - validation runs in a staged directory, in a child process with no secrets;
    - local mode adopts external changes;
    - a service lease ensures one writing process (P8);
    - the save envelope is unchanged by default (ADR 0026, reserved);
    - Play is labelled at step 1;
    - passes are non-blocking (D12).
- **Numbering decided (D40):** 4.2.1 "Shared Floor", 4.2.2, 4.2.3, not a 4.3. The 4.2.x line may add but never change a
  public name or a format, as D14 allowed for 4.1.x. The plan file is renamed `PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`.

- **Revision 4, hosted (D41):**
  - native Clever Cloud Node.js runtime, PostgreSQL, Cellar, Keycloak or any OIDC provider, no Docker;
  - rights in the Studio, one game per instance, assistant on the user's own key (BYOK).
  - What the maintainer's two Codex readings required:
    - four HTTP policies;
    - bounded revocation;
    - a separate game origin, with Safari decided by spike S;
    - the post-commit protocol and reads by revision;
    - a live preview stated as not frozen, with P4 in 4.2.2;
    - a fenced lease with Postgres timeouts;
    - a worker whose temporary capabilities are assumed visible to hostile code.
  - Their verdict: « je validerais le cap et le lancement du spike S » (I would validate the course and the launch of
    spike S).

### Checks run

| Command | Result |
|---|---|
| `npm run audit` | exit 0, `audit: clean` |
| `npm run quality` | exit 0 |
| `npx vitest run tests/support-truth.test.ts tests/changes.test.ts tests/partition.test.ts tests/ci-plan.test.ts` | 4 files, 59/59 |

→ next: human (merge this PR); Claude (spike S on Clever's native runtime, the step-0 mock-ups)
