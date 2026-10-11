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

→ next: Claude · the DSL checkpoint, then PR 3 (coverage truth)
