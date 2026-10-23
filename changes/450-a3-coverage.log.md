## 4.5.0, A3: the anchor inventory, the coverage matrix, the legacy order and the freeze

- **The inventory.** `wiki -- coverage --init` reads 70 pages: the 32 files of `docs/en` and of `docs/fr`, `PRODUCTION.template.md` included, and the six root pages. It finds 1,036 sections, 1,034 anchors, 246 code blocks and 1,805 limit candidates.
  - ATX and setext headings of every level outside fenced code. A `---` after a blank line or a list item is a thematic break, not a heading.
  - Each heading gets GitHub's slug, following github-slugger on the rendered text: lowercase; punctuation, emoji and symbols removed; accents kept; each space a `-`; `-1`, `-2`… for a repeated heading. The rendered text keeps the space an HTML tag leaves (`on <date>` gives `…-on-`, the real case of `PRODUCTION.template.md`). Autolinks keep their URL, entities are decoded, and a `_` that is not emphasis stays.
  - Two READMEs also have text before their first heading, kept as a row keyed `<file>`. A heading with an empty slug is keyed `<file>#`, so the two never collide.
  - Explicit `<a id>` / `<a name>` anchors (none in `docs/` today).
  - Each code block's sha256, language and line.
  - A section's hash covers its body, the lines under its heading, as written: only CRLF is normalised, so a hard break counts as a change.
  - The generated blocks of DSL.md and API.md (between the `dsl-doc` and `api-doc` markers) are masked; their headings stay. Those pages become generated wiki references, and `dsl-doc` and `api-doc` already guard their drift.
  - The figures `quality:baseline` writes into the READMEs (`<!-- metric:… -->`) are masked before hashing. Otherwise every pull request that adds a test would move a frozen section.
  - The limit candidates come from markers (*only*, *not*, *never*, *cannot*, *uniquement*, *seulement*, *pas encore*, *jamais*, *ne … pas*, *limite*, *attention*, *warning*), looked for outside inline code. *ne … que*, the French "only", was added. They are a review aid.
- **The cross-check.** It found 11 anchored links into these pages in the tracked files (READMEs, BENCH's and DESIGN's links, two code comments). All resolve. An anchor holding a `$` or a brace is a template, not a link. Markdown links are read relative to their file with A2's link scanner, so never inside code. Paths written in code or in other files are read from the root; GitHub `blob/main` URLs are read too. The matrix, `legacy.json` and the manifest's `replaces` are not scanned: they hold every anchor by construction.
- **The matrix**, `wiki/coverage.json` (`quest-n-click-docs-coverage` v1), has one row per section. Each row gives the old file, heading, level, anchor, line range, hash, code blocks, explicit anchors and limit candidates (`pending`, `reported`, `not-a-limit`). Then come the fields a person fills: `destinations` (`id` or `id#section`), `decision`, `reason`, `examples`, `verification`, `planned`, `migrated`.
  - All 1,036 rows are planned from Annex A, the French twins section by section like their English page: 725 keep, 245 rewrite, 66 drop.
  - The 57 ROADMAP milestone sections of each language were reread after a second-context review.
    - 24 still name open items ("left for later", "not done", "missed", "still open", "reported, not done"). They become `rewrite` → `start.roadmap#open-items`, with the items quoted in `reason`, to confirm against the current state when that page is written. The 2.5 non-goals also go to `index.not-supported`.
    - 33 are fully shipped and stay dropped. Each reason names where the history lives: the CHANGELOG version (and LOG entries), or the git tag for the releases before 3.0, where the CHANGELOG starts. A deferral closed later is named: 3.1's "reduction in proof mode" was settled in 3.3, and the NO-GO of 4.1.19 and 4.1.20 was lifted by D38.
  - A drop counts as "migrated and reviewed" only once it is confirmed (`migrated`) and every limit candidate is ticked. Its pending candidates are a gap of the check, and the drops are counted on their own line: "dropped, limits reviewed: 21/66" (45 still hold candidates).
  - Section ids are proposed in kebab case where the destination is obvious. Every row of the eight `read_doc` pages has one, so the legacy order rebuilds sections rather than whole pages.
  - 172 of the 213 manifest pages now have `replaces`. Their schema accepts the root pages and GitHub's accented anchors.
- **The merge.** `wiki -- coverage` keeps what a person wrote. A row follows its section:
  - by key, when the body is unchanged;
  - otherwise by its body, the same hash in the same file. That covers a renamed heading, flagged `changed`, and same-named twins that swapped places and so swapped their `-1` keys, carried with no flag;
  - otherwise by key again, its text `changed`.

  A new section comes in flagged `added`. A section that left its page stays at the end, flagged `removed`. A limit keeps its status while its sentence is unchanged. A `changed` row that is still planned is an error of the check until a person rechecks its destinations and runs `npm run wiki -- coverage --ack <key>`, which clears the flag on the current hash. A `removed` row that holds a decision is an error until it is carried or deleted (`--ack` deletes it). `--init` refuses to replace a matrix without `--force`. The JSON is written in a stable layout. The manifest is written by hand, so its `replaces` are set in place: every other byte is kept, and the result is checked by parsing it back.
- **`wiki/legacy.json`.** For each of the eight `read_doc` names (`DOCS`, imported from `tools/studio/tools.ts`), it holds the ordered destinations of the old sections. It is generated by `wiki -- coverage`, and the check refuses one that drifted. Deduplication is `page-covers-sections`, written in the file:
  - a destination appears once, at its first place;
  - a bare `id` covers its page, so an `id#x` after it is dropped (UPGRADING's seven v2-to-v3 steps, AUDIO's `#furnace`, STUDIO's `#structured-editing`);
  - an `id#x` before a bare `id` keeps its place and the bare `id` stays; the concatenator (C2) then emits only the sections not yet emitted.
- **The check and the freeze.**
  - `wiki -- check` now checks the matrix: schema; destinations are manifest pages, and on a written page an existing section; a planned row has a decision and a destination; a drop has a reason; every code block of the pages is in a row; `legacy.json` and `replaces` are the matrix's.
  - A matrix out of step with `docs/` is an error that names `npm run wiki -- coverage`. `tests/wiki-coverage.test.ts` holds the same guard: `docs/` is frozen.
  - Rows without a decision, and drops with pending limit candidates, are gaps. `added` rows and unresolved incoming links are warnings.
  - `check`, `coverage` and `stats` print the two counters (planned 100 % for sections, code blocks and limit candidates; migrated 0 %) and the drops' line.
- **Elsewhere.** `ci:plan`'s docs family also runs on the six root pages. `tools/wiki/coverage.ts` is a classified writer in `tests/single-entry.test.ts` (it writes `wiki/coverage.json`, `wiki/legacy.json` and the manifest's `replaces`). Keys and paths are in forward slashes on every system: the schema refuses a backslash, and linked files are read with CRLF normalised. A2's `mapLines` hands each fenced block to an optional callback; it and `mapLine` are exported, and nothing is duplicated.

→ next: A4, `read_doc` extended without replacing the active reader, `search_docs`, `list_docs`, and the bundle with `legacy/` as an exact copy of `docs/en`.
