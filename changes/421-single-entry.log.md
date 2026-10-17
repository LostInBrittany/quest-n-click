## 4.2.1 PR 3: a single entry for the game's files

Branch: refactor/421-single-entry (stacked on PR 2) · Plan §7, row 3, and P6

- **`studio.writeFiles(what, files, { guard? })`**: the core's operation API for other modules. Effects are bytes
  (`Buffer | string`).
- **Asset uploads:** one operation each. `cut-sheet.py` and the keying script run on a real copy of
  `art/<sheet>/` in `.cache/`, never on hard links, because PIL rewrites a cell in place. What they wrote there, plus
  the backups (numbered with the planned ones), is applied together.
- **Authoring CLIs** go through `tools/game-write.ts` (`writeGame`, `writeOutput`): `ids`, `i18n`, `voices`,
  `import-layout` (now async), `provenance`, `page:storyboard --md`, `prompts`, `remix`. The batch tools are not
  guarded: renamed paths change the text of the errors the guard compares.
- **The room editor** saves by `PUT /__studio/api/room/<id>/layout`, and `layoutWriter` (`/__layout`) is removed.
- **The MCP server and `studio-apply`** were already clients of the journal: their `createStudio` opens the same
  `.cache/studio-journal/` (lease plus read hashes across processes).
- **`tests/single-entry.test.ts`** inventories every program that writes:
  - `journal`;
  - `adopted`: Python art and audio tools, `migrate`. In local mode the journal records their writes as `external`
    before the next edit; in hosted mode they run in the executor or are unavailable;
  - `elsewhere`.

  A new writer fails the test until it is classified.
- **Deliberately not here:** an end-to-end test running each tool against a server, since there is no server yet.
  It comes with PR 4.

→ next: Claude (PR 4, the server)
