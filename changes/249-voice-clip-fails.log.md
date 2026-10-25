## a voiced line whose clip cannot play keeps its reading time

`say()` in `src/engine/dom/speech.ts` ended the line as soon as `audio.voice()` resolved, and `voice()` resolved at
once when it could not play (sound off, no gesture yet, voice volume 0, no howl) or on `loaderror` / `playerror`, the
same as at the clip's `end`. `voice()` now resolves `true` at the clip's end and `false` when it could not play; on
`false` the line waits for what remains of `sayMs(text, textSpeed)` since it appeared (the unvoiced line's reading
time, from `core/timing.ts`), unless a tap or a newer line ended it first. `tests/dom/voice-fallback.test.ts`: no
gesture (the real `Audio`, happy-dom), a clip that fails late (the rest of the reading time, not a whole one), a clip
that plays (it ends the line, however long). The wiki's LIMIT `voiced-line-without-sound` (`create.voices`, en and
fr) became prose; the `#autoplay` pair acked as the author's.

→ next: a GUARANTEE on `create.voices` backed by the new test, once a human reviews the claim.
