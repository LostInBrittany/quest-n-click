## 4.5.0, A2: the wiki's manifest, its check and its wiki build

- **The manifest.** `wiki/manifest.json` holds the whole Annex A catalogue as 213 pages. 209 are `planned`; the four indexes are `generated`. The count by domain: index 6, start 6, play 9, install 17, create 55 (publishing included), engine 4, studio 24, team 21, clever 23 (the overview, steps 1 to 21 and 3 bis), bridge 16, contribute 25, reference 7, help 0.
  - Each entry has an id, a type (a page doing two jobs adds `alsoTypes`), an audience, a context and its titles and URLs in both languages.
  - The how-to and troubleshooting pages carry the plan's own questions (§4.6, §13) where it gives them. The others are listed as gaps.
  - The strict zod schema refuses an unknown field. URLs are checked against the domain words, with acronyms in capitals (`EN-Reference-NPM-Scripts`).
  - `versions` and `sources` are required from `draft` on, not before: a planned page may not know them yet (plan §4.1, amended).
- **The checks.** `npm run wiki -- check` is the work level of §4.1:
  - a planned page has no file, a draft or ready page has both, and a generated page never has one;
  - every file is a manifest page;
  - a written page has `appliesFrom` and sources, and each source glob matches a tracked file;
  - links reach known pages, existing sections, tracked files and the wiki's images; a bare `src/x.ts` is refused with its working form, `../../src/x.ts`;
  - ready twins keep the same section ids, link destinations and blocks.

  A link to a planned page is listed, not refused. The npm scripts and MCP tools no page claims yet are listed as gaps. `check --publish` and the error register come in A5.
- **One link scanner** for the check and the build: titled links, images, a linked image's outer link, nothing inside fenced or inline code.
- **The wiki build.** `build --target wiki` writes the home page, the sidebars, the footer and the pages. It publishes `ready` pages only (`--preview` adds drafts under a banner); the four indexes come with the first published page. Links to the code point at the product's commit, images at `raw.githubusercontent.com`; the wiki's own images are copied. It only empties a folder it built (a marker file), keeps `.git`, and refuses an output inside the working tree outside `.cache/`.
- **`ci:plan`** reports a `docs` family and the wiki pages whose `sources` a change touches.
- **Kept apart.** The Help domain has no page: Annex A files every troubleshooting page under its own domain. The GitHub wiki has one footer for every page, so each page also ends with its own "edit the source" link.

→ next: A3, the anchor inventory of `docs/` and the coverage matrix, which fill the manifest's `replaces`.
