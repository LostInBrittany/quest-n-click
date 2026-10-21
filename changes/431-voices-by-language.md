### Fixed

- **A translation's own switches get their voices (4.3.1)**: a translation may agree a line the source language never
  agrees, e.g. English `Ready?`, French `Prêt{form?witch=e|knight=|robot=} ?`. `npm run voices -- export --lang fr`
  already listed the three French clips (`ready~form=witch`…), but `import` refused them as unknown lines, `status`
  called their clips orphans, the Studio refused their status, and `npm run validate` said nothing when one was
  missing: those read the switches of the text as written, not as translated. Each language's clips now come from
  its own text everywhere, the command line, the Studio's server (its guard and the processing worker) and its
  in-browser demo alike; a switch a translation drops no longer asks for clips by value in that language either. The
  engine already played the right clip; a test now holds the whole chain. And a line whose switches list only a
  default (`{form?*=there}`) showed its braces in the recording table; it now reads as spoken.
- **`npm run solve` says it found one path, not a proof (4.3.1)**: the hero-choice guide said `npm run solve` "proves
  every hero"; it stops at the first winning path, which one hero may be enough for. A game where only the robot can
  finish printed `solved`; `--prove` reports its softlocks. The guide, CLASSICS, DESIGN and WORKFLOW now name
  `npm run solve -- --prove` for that, and the witness's sentence, shared by the command line, its JSON, the Studio
  and the MCP tool, reads "the ending is reached on one path (…; only --prove checks every state, every answer of a
  choice included)".
