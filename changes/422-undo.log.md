## 4.2.2 PR 4: personal undo and redo

- **The stacks** (`studio-server/src/ops/undo.ts`, migration 0008): each undoable operation a member makes is kept by
  member and epoch (done, undone, gone); a new undoable edit of the member makes their undone ones gone (no redo past
  a new edit). Undo takes their latest done one, redo their latest undone one.
- **The operation** (`core.ts`, `personalStep`): its effects read from the journal (`Journal.effectsAt`), each file's
  head compared with what the operation left (undo) or found (redo): another write since is a 409; the inverse is one
  new operation through the same path as any edit (the guard, and the spans' claim: 423 when another holds one);
  history is never rewritten. The contents put back are the journal's blobs; a local journal, which adopted a file
  without keeping it, keeps the "before" of each undoable write (`Journal.keep`).
- **Where**: a shared Studio with members (the server's `leases`): `createStudio({ personalUndo })`, and the HTTP
  layer serves `/undo` and `/redo` there (`personalUndo: true`); a local Studio keeps its process's stack. The header's
  Undo / Redo are back on a hosted Studio.
- **Tests**: `tests/studio-undo.test.ts` (two members: each undoes their own, in their order, as new revisions; redo;
  a new edit drops the redo; another studio on the same journal sees the same stacks; 409 over the other's write; 423
  under the other's span), `scripts/e2e-studio-hosted.ts` (Undo in a real hosted Studio puts the last layout back as a
  new revision).

→ next: Claude (PR 5: immutable builds `/play/<n>`)
