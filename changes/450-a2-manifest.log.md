## 4.5.0, A2: the wiki's manifest, its check and its wiki build

- **The manifest.** `wiki/manifest.json` holds the whole Annex A catalogue as 213 `planned` pages. The count by domain: index 6, start 6, play 9, install 17, create 55 (publishing included), engine 4, studio 24, team 21, clever 23 (the overview, steps 1 to 21 and 3 bis), bridge 16, contribute 25, reference 7, help 0.
  - Each entry has an id, a type (a page doing two jobs adds `alsoTypes`), an audience, a context and its titles and URLs in both languages.
  - The how-to and troubleshooting pages carry the plan's own questions (§4.6, §13) where it gives them. The others are listed as gaps.
  - The strict zod schema refuses an unknown field. URLs are checked against the domain words.
- **The checks.** `npm run wiki -- check` is the work level of §4.1:
  - a planned page has no file, and a draft or ready page has both;
  - every file is a manifest page;
  - a written page has `appliesFrom` and sources, and each source glob matches a tracked file;
  - links reach known pages and existing sections;
  - ready twins keep the same section ids, link destinations and blocks.

  A link to a planned page is listed, not refused.
- **The wiki build.** `build --target wiki` writes the home page, the sidebars, the footer, the pages and the four indexes, from `ready` pages only (`--preview` adds drafts under a banner). Links to the code point at the product's commit.
- **Kept apart.** The Help domain has no page: Annex A files every troubleshooting page under its own domain. The GitHub wiki has one footer for every page, so each page also ends with its own "edit the source" link.

→ next: A3, the anchor inventory of `docs/` and the coverage matrix, which fill the manifest's `replaces`.
