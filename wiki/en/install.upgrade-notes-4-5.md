# Upgrade notes: 4.5

What 4.5.0 "Wiki" changed. Nothing to change in a game; the documentation moved.

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
  sections.
- **Two new MCP tools**: `search_docs` (by words or a question, in French or English) and `list_docs`; and
  `read_doc {id, section, lang}` reads one section of a page by its id. An agent searches first, then reads by id.
- **The package carries its documentation**, `docs-bundle/`: `npx quest-n-click mcp` in a created project reads it,
  where 4.4.0 found nothing to read.
- **Fixes**: `npx quest-n-click doctor` runs in a created project (Playwright is optional there); `npm run page:world`
  and `page:puzzles` write a `.html` file by default; a shared Studio accepts a lease on the scenario map's span
  (`groupings`).
