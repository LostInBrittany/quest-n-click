## 4.5.0, A6: acceptance by real questions (L6)

- **The questions** (`wiki/acceptance/questions.json`, format `quest-n-click-docs-acceptance` v1). 60 entries, in English and in French:
  - 53 questions: author 26, admin 14 (Bridge 3 among them), contributor 7, player 6;
  - 7 counter-examples: two absent features, two pairs of similar commands, one old procedure, two shared codes (409 and 503).

  The maintainer's eight are marked. Each entry gives its `expect` destinations (manifest ids, sections from the written page or the coverage matrix) and its `facts`, gathered from `docs/en` and the code by a read-only sub-agent and written as short statements. `beginner` names the ten questions of level 3.
- **Level 1** (`tools/wiki/acceptance.ts`, `npm run wiki -- acceptance`). It runs every question through `searchDocs` over the repository's `wiki/` (draft and ready pages):
  - a destination `id#section` matches that section only, a bare page id any of its sections, everywhere;
  - for a question, a hit when an expected destination is in the top 3;
  - for a counter-example, each row's rule: `expectEmpty` / `expectNotFirst`, `expectStatus` (not shown without `includeArchived`, marked with it), `withContext` (the right page first), and `withoutContext` (both pages in the top 5, `names` in the excerpt);
  - a justified-empty rate.

  Pending is counted apart from a miss. Today: 106 question runs and 14 counter-example runs, all pending (213 planned pages). The command exits 0; `--strict` (C1) exits 1 on a miss, a failed counter-example or a pending run. `wiki -- check` validates the file: schema, pages, sections, the four rows, the beginner set.
- **Levels 2 and 3.** `docs/dev/acceptance/AI-PROTOCOL.md` covers the channel (MCP from an installed archive, or the public URL only), the prompts (`--export-prompts <dir> [--channel mcp|web] [--url]`, one file per question and language, with no answer inside), the fresh agent, the found / missing / misread grading in a second context, and where results go: a section of `docs/dev/passes/<v>.md` outside the `field:` block. `docs/dev/acceptance/BEGINNER-READER.md` defines the pass `docs-beginner-reader`, wired like the others:
  - `PASS_IDS` and `PASS_SINCE` 4.5.0 in `tools/field/schema.ts`, and its label;
  - a binding in `surfaces.json`: the engine package, `wiki/en/**`, `wiki/fr/**`, `wiki/manifest.json`, `wiki/images/**` and the protocol, but not the acks nor the questions, so an ack does not void a carried pass;
  - a new `documentation` surface in `contracts.json` waits for it. Its `support` and `matrixRows` are null with a reason (SUPPORT.md gains its row at C2), which the registry now accepts only with a reason;
  - a Field Kit folder that names no release is asked the passes of the checkout's version, not every pass.

  No issue was opened. `passIssues` only requires the newest sheet's passes (4.4.0), so no 4.5.0 sheet was added; C3 opens the issue and records it.
- **Findings for A7 and phase B.**
  - When a page's title matches, the excerpt `search_docs` returns is the title itself. So `team.write-refused-409`'s title must name its service ("hosted Studio") for D3's "each names its service" to hold. A page that matches through `identifiers` alone has the identifier as its excerpt.
  - A two-word query that matches one word of a page's question already scores above the threshold. A neighbour can then come first. The fixture's "the game is silent" shows it.
  - The page that replaces CONTENT_GUIDE should carry the alias `CONTENT_GUIDE`.
- **Second-context review, fixed.**
  - Destinations with a section match exactly, everywhere, and a destination under two contexts is refused.
  - The documentation surface is its own contract, and the pass's binding is narrowed.
  - Documentation gaps moved out of `facts` into `gaps`, and an unsupported CI fact was dropped.
  - Prompts are numbered `q01`…: the agent gets `prompts/`, the grader `grading/key.json`.
  - `--strict` and `--export-prompts` are refused together.
  - New tests: strict with pending runs only, an old procedure shown as current, `check` validating the file, the export CLI, the 4.5.0 surfaces, and a carry across an ack but not across a page change.
- **Checked.** `tests/wiki-acceptance.test.ts` (18) covers level 1 on a fixture wiki (ten written pages, one planned): D3's 423 in both languages, « conflit de verrou » through the glossary, 409 and 503 by context, the four rows passing and then failing when mutated, the measures, pending versus miss, `--strict`, the prompts holding no answer, the real file's validity and counts. `field-carry` asks the new pass from 4.5.0, not 4.4.0. `single-entry` and `docs-consumers` list the new writer and reader.

→ next: A7, the three demonstrators (their pages make D3's questions leave pending), then the stop.
