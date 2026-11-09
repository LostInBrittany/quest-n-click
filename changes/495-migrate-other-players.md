### Fixed

- **A save migration now follows the other playable characters too (next, #495)**: `renameItem`, `dropItem` and
  `renameRoom` changed only the active player. An item renamed in another character's inventory or `used` was pruned
  on load with a warning (a key lost that way could make the game unwinnable), and a character standing in a renamed
  room was sent back to their start room. The step now renames and drops in every record of `players`: inventory,
  `used`, room and positions.
