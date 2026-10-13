## 4.1.20 PR 2c: the email connector's mutants read

- Plan §7.1, the email family of `connectors-edge`. The input was the 116 survivors that `tools/mutate.ts
  --set=connectors-edge` measured on aa2462e: 70 in `email/connector.ts`, 40 in `email/imap.ts`, 6 in
  `email/parse.ts`. The email sources are unchanged on this branch.
- One new file, `tests/connectors-email-edge-mutants.test.ts` (49 tests). There is no network and no mail server:
  - the IMAP client talks to an in-memory `Duplex` peer, since `node:net` and `node:tls` `connect` are replaced in this
    file only. Each chunk arrives as its own `data` event, so the bounds are tested to the byte: a line of 8 KB, one
    split across two reads, a joined line of 64 KB, a response of 1 MB plus twice `maxLiteral`, 64 literals, 1000
    untagged responses, a literal of `maxLiteral` twice, and an empty literal;
  - the connector's mailbox is a fake `ImapClient` (`vi.spyOn(ImapClient, 'open')`), and its MIME reader a fake that
    reads JSON;
  - the webhook listens on 127.0.0.1, port 0;
  - the clock is faked where a bound is an instant: link expiry, `toleranceS`, three poll intervals, `keepDays`;
  - the worker tests start real workers from `data:` URLs (no new fixture file).
- Each kill was checked by a scratch script that built every mutant with `mutants()`/`apply()` (each mutant sharing a
  survivor's operator, edit and line), ran only the new file, and restored the source: 108 of the 116 failed it. The
  run was interrupted once (a dropped network) and resumed from the first unconfirmed mutant. The three sources are
  byte-identical to their backups, and `git diff --stat connectors/` is empty.
- Named (8):
  - equivalent (5): `connector.ts` `sender` → true on the link lookup (the empty key is never written) and
    `c.mailbox` → true (`mailbox: undefined` is read as absent); `imap.ts` `this.buf.length` → true (concat of an
    empty buffer), `<` → `<=` on the literal wait (a literal is always followed by more bytes), and `!this.dead` → true
    in `logout` (`command` rejects at once when dead);
  - unreachable (3): `connector.ts` `if (this.stopping) return;` in `tick` (no tick fires once `stop()` cleared the
    timer); `imap.ts` `if (this.dead) return;` in `onData` (`die` destroys the socket, which then emits no data; the
    same edit on `die`'s identical line is killed); `parse.ts` `.endsWith('.ts')` → true (always true from the
    sources, the other branch only runs in the bundled package).
- Seen, not changed:
  - `track` drops `p.finally(...)` with `void`. If `handle` rejected (a `ctx.propose` or `ctx.pair` that throws), the
    rejection would be unhandled. It cannot today, since by contract they never throw. A first test whose `propose`
    threw showed it, and was replaced by one with a numeric secret;
  - a `"secret": 42` in the JSON passes `readSecret` and `start()`, then every request answers 500 `internal`, because
    node:crypto refuses the key. The configuration could refuse it at start;
  - `ImapClient.open` leaves the socket open when the greeting is not OK or a credential has a line break: it rejects
    without `die`. A server that says BYE closes the connection itself, so nothing is held for long.
- No mutation set changes. `connectors-edge` enters `GATED` in PR 2e.

→ next: Claude · PR 2d (connectors-edge, terminal)
