### Changes

- **The player chooses the hero at New Game (4.3.0)**: any number of heroes, one character with a variant per hero.
  A game asks in its intro with a `choice` whose options set a flag (`{ set: ['form', 'witch'] }`); the rest follows
  from that flag. Nothing changes for a game that does not use it (no new condition, command or state, saves and
  `schemaVersion` 3 unchanged). CONTENT_GUIDE, "Choosing the hero"; UPGRADING §39.
- **A character variant may carry a `name` (4.3.0)**: while the variant applies, the speech box, the transcript, the
  talk header and `{name}` in a fallback line call the character by it. Translated like any text
  (`char:<id>/variants[<i>].name`).
- **Text switches and `{hero}` (4.3.0)**: `{hero}` is the active hero's name; `{form?knight=him|witch=her|*=it}` is the
  text listed for the flag's current value, `*=` covering the rest. Filled when a text is shown (lines, choices,
  looks, hints, toasts, captions, item and object names, objective titles), after the translation, so each language
  writes its own words inside the braces (`content{form?witch=e|*=}`). The validator reports a malformed switch, a
  flag no command sets, a value listed that nothing writes and a value written that a switch does not cover;
  `npm run i18n -- status` lists the translations that drop a choice their source's switches make. Room, verb,
  character and variant names are shown as written: a switch there is an error. A 4.2 text holding a
  literal `{hero}` or `{word?…=…}` is now filled (UPGRADING §39).
- **Portraits in a choice (4.3.0)**: `img` on a choice option shows it as a card, the image with the option's text as
  its label and its accessible name; the cards wrap and scroll, so a phone fits any number of heroes.
- **Voices for lines with switches (4.3.0)**: a line whose words follow a flag (`{form?m=him|f=her}`) is recorded once
  per value: its clips go in `audio.voices` under `<id>~<flag>=<value>` (`grandma_saw~form=f`); with several flags in
  one line, sorted by name and joined with `~` (`greet~form=f~mood=calm`), values written as text (`true`, `2`). The
  engine plays the clip for the flags as they stand and falls back to the plain id when that clip is missing or a flag
  is not set yet, so a game can ship before every recording exists. `voicesByLang` uses the same keys. `npm run voices`
  (and the Studio's Voices tab) lists one row per value, each with its text, and `npm run validate` warns when a voiced
  line lacks a value's clip. The keys are only map keys: the file names stay the author's (AUDIO.md, "Voices").
- **The Studio previews each hero (4.3.0)**: the Play tab's **Text switches** picker sets the flag a game's switches
  read (and shows `{hero}`'s name), and the Rooms tab shows under a switched text how it reads (local Studio;
  STUDIO.md).
- **`npm run lint` and the chosen hero (4.3.0)**: `hero-looks-default` (info) says when two or more values of the
  hero's flag match no variant, so those heroes would look like the written one; a rule that only sets a flag read by
  a character's variant or a text switch (the intro's choice) is no longer reported as `action-dead`.
