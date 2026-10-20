### Changes

- **The player chooses the hero at New Game (4.3.0)**: any number of heroes, one character with a variant per hero.
  A game asks in its intro with a `choice` whose options set a flag (`{ set: ['form', 'witch'] }`); the rest follows
  from that flag. Nothing changes for a game that does not use it (no new condition, command or state, saves and
  `schemaVersion` 3 unchanged). CONTENT_GUIDE, "Choosing the hero"; UPGRADING §37.
- **A character variant may carry a `name` (4.3.0)**: while the variant applies, the speech box, the transcript, the
  talk header and `{name}` in a fallback line call the character by it. Translated like any text
  (`char:<id>/variants[<i>].name`).
- **Text switches and `{hero}` (4.3.0)**: `{hero}` is the active hero's name; `{form?knight=him|witch=her|*=it}` is the
  text listed for the flag's current value, `*=` covering the rest. Filled when a text is shown (lines, choices,
  looks, hints, toasts, captions, item and object names, objective titles), after the translation, so each language
  writes its own words inside the braces (`content{form?witch=e|*=}`). The validator reports a malformed switch, a
  flag no command sets, a value listed that nothing writes and a value written that a switch does not cover;
  `npm run i18n -- status` lists the translations whose switches differ from the source's. A 4.2 text holding a
  literal `{hero}` or `{word?…=…}` is now filled (UPGRADING §37).
- **Portraits in a choice (4.3.0)**: `img` on a choice option shows it as a card, the image with the option's text as
  its label and its accessible name; the cards wrap and scroll, so a phone fits any number of heroes.
- **`npm run lint` and the chosen hero (4.3.0)**: `hero-looks-default` (info) says when two or more values of the
  hero's flag match no variant, so those heroes would look like the written one; a rule that only sets a flag read by
  a character's variant or a text switch (the intro's choice) is no longer reported as `action-dead`.
