## 4.1.20 PR 2e: the connectors' remaining mutants read

- Plan §7.1, the last family of `connectors-edge`. The input was the 62 survivors that `tools/mutate.ts
  --set=connectors-edge` measured on aa2462e: 28 in `run.ts`, 18 in `http.ts`, 12 in `registry.ts`, 4 in
  `config.ts`. These sources are unchanged on this branch. Matched by context, the 62 entries are 62 distinct mutants.
- None of the four files was imported by a connector test: `run.ts` ran only as a child process (`connectors/bin.mjs`
  in `tests/connectors-sdk.test.ts`), out of the mutation's reach for most branches; `http.ts` and `config.ts` only
  through the email and badge connectors, never at a bound.
- One new file, `tests/connectors-rest-edge-mutants.test.ts` (18 tests, under a second):
  - `main` runs in-process with `o.stop`, `o.ready` and `o.write`; the Telnet connector's `start`, `stop` and `health`
    are stubbed, so the context it is given is read (token, manifest, tenant, limits) and nothing listens but the
    health port and a manifest server, both on 127.0.0.1, port 0;
  - `readBody` reads a fake request (declared length over, at the limit; a chunk passing the limit, exactly the
    limit); `PerAddress` takes an injected clock and its map is read (10,000 addresses, then 10,001, then the sweep at
    exactly 60 s, a live address kept with its budget); `sendJson` gets a response whose headers are sent;
  - the registry builds each id from its section (the private config read back), a null, string or number section as
    `{}`, and refuses an unknown id; `readSecret` from a file (trimmed), inline, and neither.
- Each kill was checked by a scratch script that built every mutant with `mutants()`/`apply()` (each mutant sharing a
  survivor's context, operator and edit), ran only the new file, and restored the source from a backup: 57 of the 62
  failed it, again after `biome --write`. The four sources are byte-identical to their backups, and `git diff --stat
  connectors/` is empty.
- Killed per file: `config.ts` 4 of 4, `registry.ts` 12 of 12, `http.ts` 18 of 18, `run.ts` 23 of 28.
- Named (5), all in `run.ts`:
  - unreachable: `i >= 0` → `i > 0` in `arg`: the flag is never at index 0, since `args[0]` must be a connector id
    first (pinned: `main(['--config', …])` returns 2, unknown connector);
  - equivalent: `cfg.tenantId ?` and `cfg.limits ?` forced true pass `undefined`, which `createContext` reads as
    absent (`?? 'default'`, a spread of undefined);
  - equivalent: `a && typeof a === 'object'` forced true, and `&&` → `||`: the health server listens on TCP and reads
    `address()` in its listen callback, always an AddressInfo object.
- Seen, not changed:
  - the health handler is an `async` request listener without a `catch`: a connector whose `health()` throws leaves
    the request unanswered and an unhandled rejection. The four connectors' `health()` never throw today;
  - a Bridge that refuses its manifest makes `main` reject rather than return 1: `bin.mjs` then exits non-zero with
    the stack, the message first. Under the contract (a non-zero exit, the reason said), harmless;
  - `readBody` reads a non-numeric `Content-Length` as NaN, which no comparison refuses; the streamed count still
    stops the body at the limit.
- No mutation set changes. `connectors-edge` enters `GATED` once 2b to 2e are merged.

→ next: Claude · connectors-edge gated once 2b–2e are merged; PR 3
