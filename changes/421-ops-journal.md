### Changes

- **Every Studio write is one journaled operation** (4.2.1). The files an edit touches are written together or not at
  all, durably, and an edit a crash interrupted is finished when the Studio opens again (`.cache/studio-journal/`).
  A change made outside the Studio (an editor, an agent, git) is recorded before the next edit touches that file;
  a file another process rewrote while an edit was prepared is a 409, never a lost write.
- **One guard for every edit, on the game as it would be** (4.2.1): text edits, layouts, new entities and voices are
  refused (422) when they would add a validation error, like structured values since 3.4. Nothing is written first and
  taken back any more.
- **Adding a prop, hotspot or actor is one step of undo** (4.2.1): the room and its layout come back together.
