## the routes e2e: the save and its reading in one evaluation

#438's `routes (webkit)` failed on "after Continue, Lou is … world 1072, saved … world 1073". `games/routes/e2e.mjs`
called `engine.save()` in one `page.evaluate`, then read Lou's place and the clock in another: the world loop, which
ticks every frame, could move in between, so the test compared a reload at the saved tick 1072 with the tick 1073 it
read afterwards. WebKit on CI leaves that gap more often; Chromium passed in the same run. `save()` is synchronous, so
the save and the reading now share one evaluation and no tick can come between them. #438 touched the loading path
(`afterEnd`), but only for a save with `keepPlaying`, which a routes save never has.

→ next: nothing.
