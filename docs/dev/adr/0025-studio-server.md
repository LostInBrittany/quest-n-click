# 0025 · One shared game, edited live: transactions, single-owner locks and revisions (4.3)

**Context.** The Studio is a single-user tool served by Vite. At `a0ce19d` there are at least five ways to write a
game's files:
- the Studio core's own `serial` queue (`tools/studio/core.ts:176`);
- a second queue in `tools/studio/assets.ts:297`;
- a separate `createStudio` in the MCP process (`tools/mcp/server.ts:18`);
- authoring CLIs that call `writeFileSync` directly (`tools/ids.ts`, `i18n.ts`, `voices.ts`, `pages/*`);
- a Vite route that writes a layout with no check (`tools/vite/plugins.ts:57`).

Only `setValue` and `setLayout` roll back a write that adds validation errors. `addEntity` writes two files one after
the other. Nothing is fsynced. The change feed (`plugin.ts:245`) says which file changed, but not by whom or at which
revision. The game is imported statically (`src/main.ts:4`). A save carries no content fingerprint.

The maintainer wants several developers on one server, at the same time, on one live copy of the game, with explicit
locks and frozen builds (D39). French plan: `docs/dev/PLAN-4.3-STUDIO-SERVER.md`, the source.

**Decision.**
1. **The transaction is the unit of change.** One operation queue per project, held by the server. An operation:
   - may touch several files;
   - is prepared, validated on its final state, and logged as an intent (fsync);
   - is applied by temp file, fsync and rename, then confirmed (fsync), then broadcast.

   On restart, an unconfirmed intent is finished, replayed or rolled back from its before/after hashes. Anything else
   puts the project in maintenance.
2. **Every element has exactly one write owner.** The owner is:
   - its room, by IR provenance;
   - the global part, for `game`, `items`, `cast` and `rules`;
   - the storyboard;
   - or one language.

   Every file of a game belongs to exactly one owner, or the generation fails. Map groupings (character, puzzle,
   chapter) only reference elements and lock nothing.

   A cross-cutting operation claims all its owners at once, in a fixed order. It is refused (423) without waiting if
   any one is held.
3. **Leases are fenced.** Every acquisition bumps a per-owner fencing token, and the queue checks the operation's
   tokens at apply time. A request from an expired or taken-over lease is refused even if already in flight. The
   Bridge's maintenance leases have no fencing; this is new.
4. **One validation guard for every write, on the final state.** A transaction that adds errors is refused (422).
   "Create the object + reference it elsewhere" passes as one transaction.
5. **Everything carries a revision.** The project revision is monotonic, one per confirmed operation. A diagnostic or
   a build names its revision, and an older diagnostic is shown as stale. A build is snapshotted at an operation
   boundary and compiled in an isolated directory. Its manifest names the revision, the content hashes, the engine
   and the lockfile. A failure is attributed to the revision that introduced it, never to a person.
6. **Durable and single-entry from the first step.** Each operation carries a client-supplied id; a retry returns the
   recorded result. A client reconnects with its last seen revision and gets the missing operations, or a full
   resync. Studio, assistant, MCP and authoring CLIs all go through the same operation API and the same checks.
   The Git autosave is history, not the guarantee.
7. **Transport: SSE plus an HTTP read by cursor**, as D17 chose for the player. There is no WebSocket unless a
   measurement shows SSE and HTTP cannot hold.

**Costs.**
- Every existing writer must be moved behind the operation API before anything is shared. The first PR is a neutral
  split.
- Undo becomes per person and is disabled in server mode until step 2.
- A member can run code on the server: content TypeScript is trusted code (ADR 0002). The threat model says so, and
  members are trusted.
- The shared preview needs a per-revision build. Its 5-second target is measured in step 2, not assumed.

**What would change it.**
- A need for two people editing the same long dialogue at once: CRDT on that element only.
- A measurement where SSE plus HTTP misses the latency target.
- A decision to give each person a private workspace, which the maintainer rejected on 17 October 2026.
