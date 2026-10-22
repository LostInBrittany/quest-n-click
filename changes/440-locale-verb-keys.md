### Fixed

- **The Studio checks a translation's verb keys too (4.4.0)**: a translation that gives two verbs the same key
  (`fr: verbs.take.key › "F" is already the key of "close"`) was refused by `npm run validate` only; the Studio's
  guard, its processing worker and its in-browser demo said nothing. `validate` now runs that check whenever it is
  given the translations, so every caller says the same.
