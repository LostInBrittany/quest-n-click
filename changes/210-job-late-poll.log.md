## 4.3.0: a job heard once it has ended (#210)

- `studio/jobs.ts` `followJob`: the job is followed by the live stream and by a poll every 3 s. Clearing the interval
  at the end did not stop a poll already in flight, and `seen()` only dropped a non-final state after the end, so a
  late `done` called `onChange` a second time and `assetsPanel` lost its "prepared from revision …" line. An `over`
  flag now drops everything once the job has ended.
- Seen in CI: the Firefox pass of `e2e:studio-hosted` timed out at step 6d (Prepare assets) on `main` (run
  39407655126), `feature/430-hero-choice` (39429018780) and `feature/203-verb-keys` (39486048838), in `innerText` or
  `waitFor` depending on when the overwrite landed.
- Tests: `tests/dom/studio-jobs.test.ts` holds a poll in flight, ends the job by the stream, lets the poll answer
  `done`, and checks that `onChange` heard `done` once.
- Second reading (4.3.0): the Cancel button had the same late answer. Sent just before the end and refused after it
  (409, the job has ended), its error was appended to the panel's last word. It is dropped once the job has ended; a
  test holds the refusal until after the end.

→ next: merged into 4.3.0 (D48).
