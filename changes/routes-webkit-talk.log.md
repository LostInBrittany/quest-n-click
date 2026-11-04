## the routes e2e red on WebKit: a tap on Lou as he walked out

main went red on fd8fdb5a (#400's merge) with `routes (webkit)` alone: `locator.waitFor` timed out waiting for the
conversation's choices, the engine idle, not choosing. The same failure on eea9d42d (#399's merge) and on #402's
branch (8456ba56); since d4117b15, #394's last commit, 3 of the 15 `ci` runs that played `routes (webkit)` failed
this way (a fourth before it, 449b30b0, was the "world stood still" one that d4117b15 fixed). None on Chromium, and not from #399 or #400:
8456ba56 has neither.

The cause is the e2e's timing. A world tick is 50 ms and Lou walks 150 px/s: he stands at his desk for 3 s (until tick
~60), then walks the 390 px to the door in 2.6 s (out at tick ~113). Pixel comes into the office at tick ~49, takes the
map, and talks to Lou at tick ~90–94 locally, with Lou at x 180–220 on his way out; CI's screenshot shows him at x ~123
before the talk even starts. The harness reads his box, then taps: a second later he is no longer under the tap, or no
longer in the room. Reproduced at will: 1.5 s of delay before the talk gives CI's exact failure. The engine holds a
walking Lou whenever the tap meets him (every green run did just that).

The fix waits for a real signal, twice: Lou in the office, step `paperwork`, at least 2500 of its 3000 ms left (polled
every 50 ms, so caught at its start, else a full round later, ~18 s). The map is taken at one, the talk starts at the
next, so neither depends on how long the other lasts. Talking first and taking the map after it was tried and refused:
on Chromium the harness's `dismissTranscript` waits 30 s on a transcript that closes itself under its tap (Playwright's
default timeout, the error swallowed), and Lou is gone by then. Checked: WebKit 5/5 and 2/2 under a parallel `vitest
run`, Chromium 1/1, and both with the 1.5 s delay that broke the old script; the run takes ~79 s instead of ~40.

→ next: `dismissTranscript` (`scripts/e2e/lib.mjs`) could tap with a short timeout: every conversation costs a Chromium
e2e 30 s today.
