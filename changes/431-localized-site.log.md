## the page's title and description per language

The Great Racket plays in English, French and Spanish; its tab said "The Great Racket" in all three. `site.json`'s
texts went into `index.html` and the manifest at build time, and nothing at run time knew them.

`site.json` `i18n` (`{ <lang>: { title?, shortName?, description? } }`), beside the fields it translates rather than in
the locale files (the page's texts, not the game's; the build reads them without loading the game). `siteLangs`
(`tools/vite/plugins.ts`) keeps strings only and language codes that name a file, never the game's own; the site
plugin writes them into the page (`#qnc-site-i18n`, `<` escaped) and emits `manifest.<lang>.webmanifest` per language
(build and dev middleware), the missing fields from the top level. `bootGame` calls `applySiteLang`
(`dom/site-lang.ts`) for a language other than the game's: `document.title`, the description and `og:` metas, the
manifest link. `BootOptions.site` overrides the page's block. The leak audit (`inventory.ts`) classes the language
manifests as code. Tested in `tests/site-i18n.test.ts`; documented in create.project-layout (`#site-json`) and
create.translations (EN, FR), engine.api regenerated. Checked in Chromium on The Great Racket at 844 x 390.

→ next: nothing.
