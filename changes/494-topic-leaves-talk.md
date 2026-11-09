### Fixed

- **A topic that changes room or ends the game closes the conversation (next, #494)**: after a topic whose `do` has a
  `goto`, an `end` or a sealed ending, the menu of the room just left came back, and another topic then ran against
  that old room (and was saved so with the talk verb). The conversation now closes as "Bye" does. No shipped game had
  such a topic.
