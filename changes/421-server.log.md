## 4.2.1 PR 4: the Studio Server package (no authentication yet)

Branch: feature/421-server (stacked on PR 3) · Plan §4, §7 row 4

- **`studio-server/src/server/`:**
  - `config.ts`: a JSON configuration, and secrets taken from `*_FILE` (0600) or the environment, Clever's add-on
    names included. They are removed from `process.env`, and anything short or not text is refused. `playUrl` must
    be another origin.
  - `postgres.ts`: the Studio's own `pg` adapter, with `lock_timeout`, `statement_timeout` and
    `idle_in_transaction_session_timeout` on every connection.
  - `s3.ts`: SigV4 over `node:crypto` (PUT, GET, HEAD, presign), and the blob store by sha256.
  - `service-lease.ts`: TTL 30 s, a fence, a local deadline that stops writes before expiry, SIGTERM as a shortcut.
  - `http.ts`: the shared route table (`studio-server/src/ops/routes.ts`, moved out of the plugin), probes, JSON logs
    with request ids, trust-proxy, a read/write lock so no read sees half an operation, 503 with Retry-After without
    the lease, and request replay by `x-studio-op`.
  - `main.ts`: `serve`, `import`, `export`. `serve` refuses anything but the loopback until PR 5.
- **The journal in hosted mode:**
  - adopted contents are stored in the blobs;
  - `materialize()` rebuilds the folder from the head at start (never for a project with no head: a first import is
    adopted, not emptied);
  - `reconcile()` runs every 30 s.
- **`operationContext`** (AsyncLocalStorage): a request's operations get the ids `<op>:1`, `<op>:2`…, deterministic
  across retries.
- **Tests, `tests/studio-server.test.ts`:**
  - secrets and configuration;
  - probes, API, cursor, 404/409, replay, 503 without the lease;
  - lease expiry and takeover with a new fence;
  - import → export through the command;
  - the hosted pair, run here against a local Postgres 16 and the spike's real Cellar bucket: presign and expiry,
    and a folder rebuilt after the disk is lost.
- **Deviation from the plan, stated:** reads are serialised with writes by a lock (one instance) instead of
  per-revision snapshot folders. P4's per-revision previews (4.2.2) bring the snapshots.
- **Not yet:**
  - authentication (PR 5);
  - leases on game parts, and SSE (PR 6);
  - the client (PR 7);
  - packaging (PR 9).

→ next: Claude (PR 5, OIDC)
