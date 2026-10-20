## 4.2.5: a keyboard shortcut per verb (#203)

- `VerbDef.key` (one character, presentation): `core/ir-fields.ts` says verbs' keys are presentation, the IR leaves
  them out (its verbs keep id, label and join), `core/fingerprint.ts` hashes a verb's key with the presentation only
  when it is set, so a game without keys keeps its fingerprint.
- `dom/input.ts` `onKey` → `verbForKey`: the key, lower-cased, against the verbs' keys; nothing with Ctrl, Alt, Meta
  or a held key, nor while the engine is busy, the verb bar is hidden, a line is on screen, a choice is asked, a
  transcript is open, an `.overlay` or `.dim` is in the scene, or the focus is inside a dialog. Then `pickVerb`, as a
  tap (a second press drops the verb).
- `dom/app-shared.ts` `verbLabelHtml`: the label with the key's first occurrence in `<u>`, escaped; `dom/shell.ts`
  uses it and sets `aria-keyshortcuts`.
- `tools/i18n.ts`: `verb:<id>/key` is a text to translate, applied like the label; `localeStatus` does not count an
  unchanged key as untranslated (Open's O is Ouvrir's).
- The validator (`tools/validate/player.ts`): `verbKeyChecks` refuses a key that is not one character, Space and a key
  shared in any case, and warns when the label lacks the letter; `localeVerbKeyChecks` runs it on each translation
  (`<lang>: verbs.<id>.key`), called by `tools/validate.ts`.
- Tests: `tests/dom/verb-keys.test.ts` (a key picks and drops its verb in any case; nothing without keys, with a
  modifier, while typing, under the pause menu, during a choice, inside a dialog or while busy; the underline and
  `aria-keyshortcuts`; the validator in the game and in a translation; the locale path and the status; the
  fingerprint unchanged without keys).
- Docs: CONTENT_GUIDE (en, fr) after the single tap; ENGINE's accessibility (en, fr); `docs/dev/DSL-STABILITY.md`
  under D46.
- Left as is: the demo sets no keys. Its English verbs Pick up, Push and Pull share P, U and L with Look at and Use,
  so its letters are a content choice for its author.

→ next: the maintainer's review; Jack cherche un taf sets its verbs' keys.
