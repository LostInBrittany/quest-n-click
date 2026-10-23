## site.json's url: an absolute og:image and an og:url for link previews (#271)

- **Why:** clever-onboarding, deployed at the root of its domain, served `og:image` = `/og.png`; the Open Graph protocol wants an absolute URL there, and LinkedIn and Facebook showed no image. The engine cannot know where a game is served, and a game could not say it without editing `index.html`.
- **`tools/vite/plugins.ts`:** `siteUrl` reads `site.json`'s `url` (an absolute `http(s)` URL, a final slash added; anything else is none); `sitePlugin`'s page transform then writes `og:image` as `<url>og.png` and adds `og:url` before `og:type`. `index.html` is unchanged, so `tests/field-carry.test.ts`'s check of `%BASE%og.png` still holds.
- **Tests:** `tests/site-url.test.ts`, four (without it, with it, the slash and the escaping, the addresses ignored).
- **Docs:** `create.project-layout#site-json`, both languages.
→ next: nothing.
