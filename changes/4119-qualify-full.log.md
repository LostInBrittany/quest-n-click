## 4.1.19 PR 5: the qualification profile complete (runs, workers, Daily and Mystery, quotas, moderation, 4.1.17)

- Plan §9. Tenant a gets `runs` and `daily` sections:
  - the reference game approved by its fingerprint, computed with `approvedContext` on the host;
  - the speedrun worker from this checkout, mounted read-only at `/srv/app`, run by the Bridge as its child inside its
    confined container;
  - `perMinute` 6, a moderator token file (mode 600), and the reference's published daily test key.
- New steps:
  - the daily token is the same on the three instances;
  - a Mystery committed on one instance is revealed alike on the two others;
  - a run is verified, and its duplicate is answered 409;
  - a moderation bearer is refused with 401 and accepted with 200, giving `moderator-verified`;
  - `bridge-2` and `bridge-3` are paused, `bridge-1` claims the run and is killed while its worker verifies; another
    instance takes the run when its lease ends and verifies it once (one row in `runs`);
  - after the bucket refills, junk submissions spread over the three instances are refused past six, from at least
    two instances;
  - 20 000 runs are written in SQL and the board is read 20 times through the proxy (p95 bound 1.5 s);
  - after the schema 3 restore, the board, the daily token and the run are compared;
  - the 4.1.17 Bridge archive, checked against its release's SHA-256 and run in a one-off container of the same base
    image, makes its schema in a database of its own; a run is written there in its shape, and this Bridge's
    `doctor` and `migrate` report schema 4 with nothing to do. The two releases share schema 4.
- Reads are polled every 1.5 s, because each instance gives one client address 60 anonymous requests a minute.

- The second reading (an automated second context) found three checks that could pass while what they named was
  false, plus a 4.1.17 step weaker than its title. All are fixed:
  - **Daily token**: the token is a deterministic signature, so three instances agree even without a store. The check
    now reads the `daily_kv` row, names the day, and compares that row before and after the restore.
  - **Takeover**: counting rows on the primary key proved nothing. The check now reads the row under `bridge-1`'s
    lease after the kill, retries if the run was verified before the kill, waits for `done` after the lease's end, and
    requires exactly one `run.verified` from another instance.
  - **Quota**: the per-address limit also answers 429. The check now requires the quota's own message and exactly
    `perMinute` submissions allowed.
  - **4.1.17 store**: the 4.1.17 code now writes real data, through its own `restore` of a schema 1 backup of tenant
    a. This Bridge's `backup` then finds the tenant, its signals and the run.
  - **The worker's code** is a `git archive` of what it reads, with the modules mounted beside it, instead of the
    whole checkout. The job's token is no longer kept in `.git/config` (`persist-credentials: false`).
  - **`--short`**: the candidate's `deployment-smoke` runs the profile without its long steps. `--old-bridge=` serves
    offline runs. The download is retried with a timeout, the base image is pulled first, and the compose project name
    is fixed.
  - **Disclosed**: a worker killed alone, its Bridge alive, is `bridge-runs-worker`'s case, not this profile's.

→ next: Claude · the DSL checkpoint, then PR 3 (coverage truth)
