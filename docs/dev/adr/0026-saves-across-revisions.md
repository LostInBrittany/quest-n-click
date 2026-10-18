# 0026 · Saves across revisions: the envelope unchanged, a question before resuming (4.2.2)

**Context.** A hosted Studio serves the game as the preview of a revision (`/preview/<rev>/`, 4.2.2 PR 2a), and every
revision's preview is on the same game origin, so they share the browser's saves. A save made in revision 3 can be
resumed in revision 9, where a room, an item or a flag it refers to may be gone. The plan
(`docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md` §2.2, guarantee G2) asks for a choice before such a resume; D40 forbids a
change of the save format in 4.2.x.

**Decision.**

1. **The envelope does not change** (`SaveEnvelopeV4`, `src/engine/core/save.ts`). What a save says of where it was
   made is written beside it:
   - a manual slot: `SlotMeta.revision` (`{ rev, fingerprint }`), optional, read back only when well formed;
   - the autosave: one record per game in the page's storage (`<game>.save-revision`), written after each autosave
     and removed when the autosave is erased.
2. **Only a build that declares its revision does this** (`BootOptions.revision`; a preview takes it from its base).
   The player's builds write nothing more and never ask.
3. **The test is the content, not the number.** The record holds the full fingerprint (ADR 0013: logic, trusted
   extensions, presentation, engine). A save made in the same content resumes without a question, whatever the
   revision number (a revision that changed only the notes asks nothing); one made in other content, or under another
   engine, asks.
4. **The question has three answers** (on Continue, and on loading a slot):
   - **Resume here**: loaded as it is. It may fail, or play oddly, if this revision removed what the state refers to:
     the question says so, nothing repairs it;
   - **Restart**: a new game (on Continue, confirmed as New game is, since it replaces the save);
   - **Stay in revision N**: the save's own revision, by its URL (`/preview/N/`), offered when the number differs.
5. **Its texts are the Studio's**, in English, outside the game's `ui`: only the game's authors see a preview, and a
   game needs no new key (D40).

**Tests.** `tests/revision.test.ts` (no question for the same content or a save that says nothing; each answer
followed; the autosave's record follows its saves and its erasure, and a refused storage changes nothing; a slot keeps
a well-formed record only); `scripts/e2e-studio-hosted.ts` (in a real preview: the revision recorded, the question
with its three answers, Stay opens the save's revision).

**Costs.**
- The autosave's record lives apart from the save: storage cleared by hand, or refused, loses it, and that save then
  resumes without a question, as before 4.2.2.
- A revision whose preview is no longer kept (collection, 4.2.2 PR 7; another epoch) cannot be stayed in: its URL
  answers that there is no such preview.
- The Studio's Play tab starts a new game (`?dev`) and does not offer Continue; the question there comes from a slot.

**What would change it.**
- A save format change (a 4.3): the revision and the fingerprint could then go into the envelope itself.
- A migration of states between revisions (renamed rooms and items followed): Resume could then repair instead of
  warn.
