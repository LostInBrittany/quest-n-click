### Fixed

- **The Studio adds a reaction in a room with exits (next, #461)**: "+ Reaction" asked for `on[n]` after the exits'
  own rules, which the engine appends to the room it reads (`normalizeExits`) and the file never holds, and the
  Studio Server refused it as `path not found`. A new reaction now goes after the written ones. An exit's rules are
  listed as "from exit <id>", without an "Edit…" button that would have failed the same way: they are edited through
  the exit. An append past the end of a written list says how many entries the file holds and where a new one goes.
