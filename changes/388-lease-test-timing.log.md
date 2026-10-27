## The lease renewal tests wait for the renewals, not for a time

#388: main's `ci` on `d19ec462` failed on `windows` only, "the exclusive lease, its edges > says a renewal that fails,
and goes on": `exclusiveRunner` with `everyMs: 5` around `tick(30)` logged one `lease-renew-failed` where the test
wants two. Windows' timer resolution (about 15.6 ms) lets a 5 ms interval fire once or twice in 30 ms; the PR's run
(#385) was green by luck. Ruling: no fake timers (the runner's `setInterval` and its promise chain would need
`advanceTimersByTimeAsync` and the `unref`); the operation under the lease is `until(() => lines.length >= 2)`, a
1 ms poll at file level, and the second run without a log `until(() => n > 0)`. The same shape in "the owner's
exclusive lease around a long operation" (`setTimeout(40)` then at least two renewals at `everyMs: 10`) now waits
for the two renewals. Its 30 ms "nothing after the release" stays: it can only pass wrongly, never fail on a slow
runner. A hang would end at vitest's test timeout. No production code touched. Not reproduced on macOS: the old file
passed 15 runs out of 15 under load, as did the new; the new one also 30 runs out of 30 alone, and `npm test`.

→ next: nothing.
