## #410 PR 3: the downloads and the wiki's clone tried again, the releasing page, a flaky test

Three network steps of a release that one refusal from GitHub cost a job's re-run, and the page that says what the
release tools do.

- The 4.7.0 candidate's external-consumer (macos-15, from 4.1.18-rc.1) failed on a 504. The download was not
  single-shot, as the issue read it: `fetchRetry` (4.1.20) tried it five times, 5 to 20 s apart, 61 s in all, with no
  line in the log. It now says each failed try and spends about three minutes (seven tries, 5 s doubled, a minute at
  most); `download()` throws on what is not a 2xx in the end. `upgrade-check`'s single `gh release download` and
  `ops-qualify`'s hand-rolled loop (which tried a 404 again) use it.
- 4.7.0's `docs-publish` failed on the wiki's clone ("Permission denied (publickey)", the same key passed on the
  re-run). `pushWiki` takes #416's `retried` from `tools/release/lib.mjs`, which gains an `again(error)` predicate: the
  clone always, the push unless `pushRefused` (rejected, non-fast-forward, fetch first, GH006, a declining hook,
  "Permission to … denied"). An SSH "Permission denied (publickey)" is tried again: it is GitHub refusing the
  connection, not the key's rights.
- `tests/reality-cursor.test.ts`'s SSE warm-up acknowledged on a 1 ms timer that raced the port's 5 ms one (set a
  signal earlier); a 10 ms stall in the reader reproduced "s1 twice" every time. The test now awaits the
  acknowledgement; 50 runs under a CPU load and three parallel fork runs, all green. Its file's hash moved, so the
  claim `bridge-resume-from-durable` (the polling test, unchanged) has an AI author review recorded and needs a
  person's again.
- `contribute.releasing` (en, fr) says #416's behaviours; the coverage ratchet (#436) is not on that page.

→ next: a person's review of `bridge-resume-from-durable` (`npm run wiki -- review-claim … --kind human`); #410's
remaining PRs.
