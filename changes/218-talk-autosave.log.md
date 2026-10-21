## 4.3.0: a conversation saved after each topic (#218)

- `core/interactions.ts` `talkLoop`: the topic menu runs until "Bye" inside one `Engine.run`, whose `finally` is the
  autosave. A topic's `do` changed the state, but nothing reached the store before "Bye". Found in a game whose
  character offers three trials as topics, each a minigame setting a flag: after trial 1 the autosave still lacked the
  flag, and a player who lost the tab during trial 2 replayed trial 1.
- The fix: `eng.save()` after the topic's `do` and its `seen` key (and its `writes` entry), the point where the topic
  is whole and the menu is about to come back. Like the save in a room's `enter`, it does not emit `saveMade`: the
  journal's `saved()` stays at the action's end, so one action still journals one autosave. `Engine.save` checks the
  objectives first, so an objective completed by a topic is now announced at the topic, not at "Bye".
- Not done: a save after the `minigame` command itself. A topic is the unit a player sees end; a minigame sits in
  the middle of a `do` (its `then`, the commands after it), and a save there would keep half a `do` that a reload
  never finishes. A minigame run by a rule ends its action and was already saved.
- Tests: `tests/core.test.ts` reads the `MemoryStore` each time the topic menu is shown; the second menu must hold the
  flag set by the first topic and its `seen` key.

→ next: review.
