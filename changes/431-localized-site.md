### Changes

- **The page's title and description per language (4.7.0, #431)**: `site.json` takes an optional `i18n`, the
  `title`, `shortName` and `description` in the game's other languages (`"i18n": { "fr": { "title": "…" } }`). When
  the page plays one of them (`?lang=`, Settings, the browser's language), the tab's title, the description and the
  install name (a `manifest.<lang>.webmanifest` per language) are that language's; the Language row of Settings
  reloads the page, so they follow it. The HTML as served, which link previews read, stays in the game's own language.
  `BootOptions.site` passes the texts for an embedder with its own page. API: `quest-n-click/player` exports the types
  `SiteText` and `SiteTexts` (additions only).
