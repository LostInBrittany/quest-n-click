### Changes

- **Every surviving mutant of what the connectors share read** (4.1.20): the 62 survivors of `connectors-edge` in
  `connectors/src/run.ts` (28), `http.ts` (18), `registry.ts` (12) and `config.ts` (4) were read one by one. 60 are
  killed by `tests/connectors-rest-edge-mutants.test.ts`, which runs `web-scumm-connector` in-process (its arguments,
  `--config=`, the token from a file or inline, the manifest from a file or the Bridge, the tenant and limits, the
  health and metrics port and its 404s and 503), reads a body at its limit, the per-address budget at the minute and
  its sweep above 10,000 addresses, and builds each connector from the registry. The other 2 are named in
  `docs/dev/mutants.json`: 1 equivalent and 1 unreachable.
