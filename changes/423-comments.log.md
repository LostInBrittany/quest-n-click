## 4.2.3 PR 3: comments anchored on stable ids (H2)

- `studio-server/src/server/comments.ts` (`Comments`) and migration 0012 (`studio_comments`, kept by the backup):
  a comment's anchor (a stable id: letters, digits, `. : @ - _`; '' for the game), its revision, a thread one level
  deep (a reply takes its thread's anchor), resolved as a thread; `orphan` when the anchor is not among what the game
  names (the IR's provenance, the storyboard's boards and panels, read once per revision; when the game does not load,
  no comment is said orphan); its author alone changes its text, a reviewer resolves their own threads, a dev any; the
  notes of `notes.json` imported once each (`source` unique), free text kept at the head of the text.
- Routes GET/POST `/api/comments`, PUT `/api/comments/<id>` (a reviewer's: `roleFor`), POST
  `/api/comments/import-notes` (an owner's); the Notes tab's Comments panel (`src/studio/comments-panel.ts`).
- Departure from the plan: comments are kept in the Studio's database rather than a game file, so a reviewer writes
  no game file; `ids --lines` as an exclusive operation is not in this PR (the hosted engine upgrade's worker job, PR 8,
  is where it would run). A local Studio keeps its notes.
- Docs: STUDIO-SERVER "Comments" (en, fr).
- Tests: `tests/studio-comments.test.ts` (anchors, threads, orphans, a game that cannot be read, refusals, who changes
  and resolves, every note imported once), `tests/studio-collab.test.ts` (a reviewer comments, 200, and writes the
  game, 403; the import an owner's), `tests/dom/studio-comments-panel.test.ts`.

→ next: Claude (4.2.3 PR 4: the semantic diff, H3)
