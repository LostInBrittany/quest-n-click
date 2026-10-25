## the install retries get a limit per attempt

#338's `studio-hosted` failed in its first attempt of `npx playwright install --with-deps chromium firefox`: apt pulled
from `azure.archive.ubuntu.com` at a few kB/s and the step's `timeout-minutes: 10` cut the whole loop at 21:15:35, so
`for i in 1 2 3` never reached its second attempt (34 s on main's run 40228643869). A step limit alone bounds a hang,
it does not retry it. Every loop of the shape `for i in 1 2 3; do (…) && break; [ "$i" = 3 ] && exit 1; echo "retry
$i"; sleep 15; done` (79 over eight workflows) is audited: on Linux (74) the attempt runs under `timeout <n>m`, with
3 × n + 1 ≤ the step's minutes (20 → 6, 15 → 4, 12 and 10 → 3); the 8-minute steps go to 10 (2 minutes an attempt
was too close to `npm ci`'s 59 s), `studio-hosted`'s Playwright step to 20 like the other `--with-deps` steps;
`release.yml`'s pinned npm got the parentheses the others have. GNU `timeout` signals its process group, so npm's
and apt's children go with it. The jobs that run on macOS or Windows (`windows`, both workflows' `external-consumer`)
are left unbounded per attempt, a comment says why: macOS has no `timeout`, and Windows' System32 `timeout.exe` may
come first in Git Bash's PATH. Out of scope: polling loops (`seq 1 60` with curl, `pg_isready`), the bridge-load
measurement runs, the revalidation call (curl `--max-time`). `tests/ci-retry.test.ts` parses every workflow, checks
it found every loop the text has, and pins both rules; actionlint 1.7.7 is clean on the eight files. The CI page's
known-flakes row (en, fr) says it.

→ next: a portable per-attempt limit for the macOS and Windows jobs, if one of them ever stalls the same way.
