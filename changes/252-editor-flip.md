### Changes

- **The placement editor turns a character or a prop around (4.5.0, #252)**: the editor's Selection folder
  (`?edit=<room>`, and the Studio's Rooms tab, which embeds it) has a **mirror ↔** checkbox for the selected prop or
  character and a **mirror ↕** one for a prop: the layout's `flip` and `flipV`, which only the phone placement page
  could set. A character whose room sets `facing` keeps it, as before (the room's `facing` wins over the layout's
  `flip`): the panel says so under the checkbox. Nothing to change in a game.
