### Changes

- **Images per language (4.7.0, #430)**: `i18n.images` in `game.ts` names, for an image id, the image each language
  draws in its place (`{ 'logo/r1c1': { fr: 'logo/fr', es: 'logo/es' } }`): a title logo lettered in each language, a
  sign. The content keeps the source id; wherever it is drawn (title screen, rooms, props, icons, map), the language
  being played draws its variant, and the game's own language draws the source. The offline cache keeps every
  variant, so switching language offline still finds them. The validator checks every id and warns of a variant that
  is never drawn (the game's own language, a language the game does not ship). Presentation only: rules, saves and the
  solver do not see it.
