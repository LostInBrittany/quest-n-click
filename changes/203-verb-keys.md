### Changes

- **A key per verb: O for Open, as in the LucasArts games (4.3.0, #203)**: a verb's optional `key`
  (`{ id: 'open', label: 'Open', color: '#8fd3ff', key: 'o' }`) picks it at the keyboard as a tap on its button would,
  in any case and without Ctrl, Alt or Meta, and does nothing while the engine is busy, a line is on screen or
  something covers the scene. The button underlines the letter in its label and announces it (`aria-keyshortcuts`).
  The key is translated with the label (`verb:<id>/key`). `npm run validate` refuses a key that is not one character,
  Space and a key two verbs share, in the game and in each translation. With `settings: true` the player can turn the
  keys off (a "Verb keys" row, `ui.verbKeys`, shown only when a verb has a key: WCAG 2.1.4), and the validator warns
  about keys in a game without a settings menu. Without `key`, nothing changes.
