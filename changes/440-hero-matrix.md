### Changes

- **The Studio's hero × language matrix (4.4.0)**: the Voices tab has a second view, "Heroes × languages", read-only
  and in the in-browser demo too. For each line with an id whose text (in any language) has a text switch or
  `{hero}`, a column per hero (each value the switched flags take, headed by the variant's portrait and name) and per
  language; each cell shows the text that hero reads, the clip that plays, and the keyed clip that is missing (the
  plain id named when it plays instead). A row flags an untranslated language, a translation that drops a choice the
  source makes, and a hero's value no switch of the line lists without `*=`; "Lines with a problem" keeps only those.
  The same data as `GET hero-matrix` on the Studio API, and as `heroMatrix(game, locales)` in
  `src/engine/tools/hero-matrix.ts`.
