# Upgrade notes: 4.5

What 4.5.0 "Wiki" and 4.5.1 changed. Nothing to change in a game; the documentation moved.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## From 4.4.0 to 4.5.0 "Wiki"

Nothing to change: a game builds, plays and saves as on 4.4.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.0/…`. What is new:

- **The documentation is the wiki.** It lives in the GitHub wiki, in English and in French, and in the documentation
  of each release (`/docs/<version>/` on the project's site). The old pages under `docs/` are now transition pages:
  each old heading stays and links to its new place, so an old link still lands, and the complete 4.4.0 text stays
  readable at the tag `v4.4.0`.
- **`read_doc {name}` still works**: the eight names (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) answer one text block, with 4.4.0's arguments; the page is rebuilt from the wiki's
  sections, and a section too long for its bound is shortened to its heading, first paragraph and the
  `read_doc { id, section }` that gives the rest.
- **Two new MCP tools**: `search_docs` (by words or a question, in French or English) and `list_docs`; and
  `read_doc {id, section, lang}` reads one section of a page by its id. An agent searches first, then reads by id.
- **The package carries its documentation**, `docs-bundle/`: `npx quest-n-click mcp` in a created project reads it,
  where 4.4.0 found nothing to read.
- **Fixes**: `npx quest-n-click doctor` runs in a created project (Playwright is optional there); `npm run page:world`
  and `page:puzzles` write a `.html` file by default; a shared Studio accepts a lease on the scenario map's span
  (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## From 4.5.0 to 4.5.1

Nothing to change: a game builds, plays and saves as on 4.5.0 (the same fingerprints, golden saves and reference
runs). The engine installs from `releases/download/v4.5.1/…`. What a game may use, each optional:

- **`games/<id>/spans.json`**: the spans of the game's own files (the modules its `index.ts` imports, its notes, its
  scripts), which a shared Studio refused to write before. The engine's rules come first; a file neither names is
  still refused ([span](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`**: a word the leak audit blocks that is also, by chance, a word of the game (a real
  person's first name), allowed by its SHA-1 prefix and a reason, in the game's folder and its built assets only
  ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` in `site.json`**: the game's public address. With it, the page's `og:image` is absolute and an `og:url` is
  added, so LinkedIn and Facebook show the share image; without it, the page is as on 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **The documentation**: the fixes of the maintainer's wiki audit (links whose label is code, the first tutorial,
  saves, the support window, search). A link to a page or a section of 4.5.0 still lands.
