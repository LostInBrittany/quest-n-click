### Fixed

- **A conversation saves after each topic (4.3.0, #218)**: a conversation is one action, and the autosave came only
  when it ended, at "Bye". What a topic changed (a flag, an item, a minigame won) was lost if the page died before:
  on a phone, a tab killed in the background or a battery gone flat sent the player back before the topic. The state
  is now saved after each topic's `do`, once the topic is marked as seen. Nothing to change in a game.
