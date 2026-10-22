## 4.4.0: the mutation reread read again (a restore race pinned, a short write tested, the simulator's listener)

- A second automated reading of #235's work (LOG: the 137 exemptions read again) found two entries wrong and one leak
  more. `restore.ts`'s `if (o.force)` was named equivalent, yet its own reason described a difference: a run or quota
  that another connection commits after the checks (Postgres READ COMMITTED). Without `--force` the read-back refuses
  and rolls back, keeping that row; the mutant would delete it and succeed. `tests/reality-store-backup-mutants.test.ts`
  now stages that commit (a wrapper answers the checks as the store was before it) and kills the runs' and the quotas'
  DELETE mutants; the daily records' stays named (without --force its key list is empty, nothing is sent).
- `durable.ts`'s write loop: `buf.length - off` → `+` was named equivalent ("a regular file is written whole");
  POSIX does not promise that (FUSE, network file systems). `tests/studio-durable-mutants.test.ts` makes one write
  short by a byte: the original finishes the file, the mutant throws. The entry is removed.
- `simulator.ts`: the same `{ once: true }` leak as the port's sleep, one listener per empty wait; removed when the
  wait ends, `tests/reality-simulator.test.ts`.
→ next: the release.
