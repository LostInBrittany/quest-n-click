### Changes

- **Prepare assets on a hosted Studio (4.2.2)**: the Play tab's "Prepare assets" (a dev) runs `prepare` on the
  processing worker from the head's art and sounds, under the project's exclusive lease; the prepared set is kept by
  the Studio and served before `publicDir`, and the game's `assets.gen.json` is written as one operation. Sprite sheets
  and uploads stay on a local Studio (4.2.3).
