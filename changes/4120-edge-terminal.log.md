## 4.1.20 PR 2d: the terminal connectors' mutants read

- Plan §7.1, the terminal family of `connectors-edge`. The input was the 113 survivors that `tools/mutate.ts
  --set=connectors-edge` measured on aa2462e: 44 in `ssh/connector.ts`, 32 in `terminal/shell.ts`, 25 in
  `telnet/connector.ts`, 12 in `terminal/guard.ts`. These sources are unchanged on this branch. Matched by context,
  the 113 entries are 114 distinct mutants (`a.method === 'password' && … && …` has two `&&`; `if (!open) return;`,
  `open = false;` and `shell.closed = true;` each appear on two or three lines).
- One new file, `tests/connectors-terminal-edge-mutants.test.ts` (52 tests, under a second). There is no network for a
  session:
  - a Telnet session is a fake socket handed to the connector's own `connection` handler, an SSH one a fake ssh2
    connection handed to `client`: its authentication contexts (password, `none`, `keyboard-interactive`,
    `publickey` and `hostbased`, signed with real ed25519 keys from `sshKeyPair`), its session, pty and channel;
  - the servers that start (start, stop, health) listen on 127.0.0.1, port 0, and nobody connects to them;
  - the gate, the guard and the resume words take an injected clock; the pairing timer runs under fake timers;
  - the bounds are tested at the bound: a wrong code exactly `triesWindowMs` old, a second exactly 1000 ms later,
    exactly `bytesPerSecond`, a line exactly a minute old, a word exactly at its time to live, 10,000 words and
    10,000 addresses (the sweep counted by clock reads), a 64-byte subnegotiation, a 64-character password, a line
    exactly the terminal's width.
- Each kill was checked by a scratch script that built every mutant with `mutants()`/`apply()` (each mutant sharing a
  survivor's context, operator and edit), ran only the new file, and restored the source from a backup: 112 of the
  114 failed it (two first lived, a missing flush in one test; fixed and checked again). The four sources are
  byte-identical to their backups, and `git diff --stat connectors/` is empty.
- Killed per file (survivor entries): `guard.ts` 12 of 12, `shell.ts` 32 of 32, `telnet/connector.ts` 25 of 25,
  `ssh/connector.ts` 42 of 44.
- Named (2), both in `ssh/connector.ts`:
  - equivalent: `playerId ? { playerId } : {}` forced true gives `{ playerId: null }`, which `VirtualShell` reads as
    `?? null`, the same as absent;
  - unreachable: `Array.isArray(k)` → false in `parseOne`: ssh2 1.17's `parseKey` never returns an array (pinned by a
    test of the new file for public, private, garbage and non-string keys).
- Seen, not changed:
  - `TelnetConnector.stop()` sets `shell.closed` but not the session's `open`: until the socket is destroyed (1 s
    later), bytes a client still sends are read (counted, filtered, assembled into lines), and what that writes back
    goes to an ended socket, where it fails quietly. The shell itself handles nothing more. Harmless today;
  - several guards are defence against ssh2 changing shape (a non-numeric `cols`, a `password` on another method,
    `server.address()` null, a second `close` event): they are pinned with fakes of that shape, not by ssh2 itself.
- No mutation set changes. `connectors-edge` enters `GATED` in PR 2e.

→ next: Claude · PR 2e (connectors-edge, the rest; then the set gated)
