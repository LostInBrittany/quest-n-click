## 4.2.3 PR 1: the revision read, and the 409 that says what changed (H10)

- **The journal** (`ops/journal.ts`): an operation's `readAt`; a file of its effects written after it is a 409 whose body
  says `path`, `readAt`, `head`, and the file's text at each (`before`, `now`: null when absent, binary, longer than
  256 KiB, not UTF-8, or not kept). `blobAt(path, rev)`: a file's content hash at a revision (the first later
  operation's `before`, else the head's).
- **The server** (`http.ts`, `core.ts`): `x-studio-base` (a revision, else 400) into the operation's context; a write's
  answer carries `x-studio-revision`, the revision after it.
- **The Studio** (`src/studio/api.ts`): the revision each resource was last read at, by its read path; a write sends
  the longest read path's revision; its own answer moves it on. The 409 dialog (`spans.ts`) shows the changed lines
  with two lines of context (`line-diff.ts`, an LCS bounded at 2,000 lines) and offers "Apply my edit on the latest
  version": the edit is sent again from the head's revision, computed again by the server on the file as it is.
- **Limits**: a write is checked against the revision of the resource its editor read, for every file it writes (a
  file outside what the editor showed can refuse it too, never the reverse); a client that sends no `x-studio-base`
  (a script, the MCP until PR 5) is not checked this way. The merge is the edit applied again, not a three-way merge of
  texts: two edits of the same field keep the later one, after the member saw the earlier.
- **Mutation** (`studio-ops`, gated): `journal.ts` 159 of 165 killed locally, 6 named (one new, equivalent: the
  condition that spares a head read when no revision was read).
- Tests: `tests/studio-journal-mutants.test.ts` (the revision read), `tests/studio-collab.test.ts` (two members over
  HTTP, the 409, the edit applied on the head, a write's own revision), `tests/studio-line-diff.test.ts`,
  `tests/dom/studio-hosted-screens.test.ts` (the dialog).

→ next: Claude (4.2.3 PR 2: the scenario map, H1)
