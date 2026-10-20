## 4.3 "Hero Choice": the player chooses the hero, its look, its name and the words the others use

- **The need and the plan**: the maintainer's next game lets the player choose the hero at New Game, male or female
  there and any number of heroes in general. `docs/dev/PLAN-4.3-HERO-CHOICE.md` (its §2 the admission file: `players`
  shows a switch button per hero, a Remix dimension is filled at boot where the hero belongs to a save, lines
  duplicated under `if` double with every translation), ADR 0022 (the first DSL extension since the freeze, through
  D33's gate), D46.
- **The maintainer's answers (20 Oct, D46)**: the switch syntax `{form?m=him|f=her}` kept as written; the choice shows
  portraits **and** text; the number of heroes is arbitrary (the fixture has three); one name per hero; voices
  "eventually", so their lookup is designed now (`<id>~<flag>=<value>`) and built last.
- **Step 2, a name per variant**: `CharacterDef.variants[].name`; `character()` merges it, `nameOf()` reads through
  it (so `{name}` in a fallback), the DOM's speaker label, live region, transcript and talk header read it; an i18n
  path `char:<id>/variants[<i>].name`. Tools keep the written name.
- **Step 3, text switches**: `core/text-switch.ts`, a pure parser (`{hero}`; `{<flag>?<value>=<text>|…|*=<text>}`,
  `String(value)` compared exactly, `*=` then the first text, no nesting, a malformed switch left as written);
  `Engine.text` at every display site (lines, choices, looks, hints, toasts, captions, item and object names,
  objective titles), after `fill()` and the translation. The validator (`validate/text-switches.ts`) reports a
  malformed switch, one in a text shown as written, a flag no command sets, a value listed that nothing writes, a value
  written that no switch covers; `npm run i18n -- status` lists translations that drop a choice their source makes.
- **Step 4, portraits in a choice**: `Choice.img`, shown as cards with the option's text as the label; presentation
  only (the logic fingerprint does not move), preloaded by the asset graph, checked by the validator.
- **Step 5, the fixture and the docs**: `tests/fixtures/heroes.ts`, three heroes (the written look is the robot, two
  variants make the knight and the witch, each named), an intro choice of portraits setting `form`, Grandma's lines
  with switches and `{hero}`, a key under a rug, a French table with its own words in the braces (the agreement
  `Prêt{form?witch=e|*=}`), a checkpoint per hero. `tests/hero-choice.test.ts`: validates clean; the proof finishes,
  and with the door opening for one hero only it still finishes, for each of the three (every answer of the intro is
  searched); a walkthrough per hero (the name, the switched lines, `{hero}` in a line and in an item's look, no brace
  on screen); the French forms for each; a save loaded in a new engine keeps the witch; a checkpoint names its hero.
  The lint: `hero-looks-default` (info, `src/engine/tools/lint-hero.ts`) when two or more values a `set` writes for a flag the
  hero's variants read match none of them (one such value is the usual design: the written look is a hero too); and
  the intro's `set` is no longer `action-dead` when what it sets is read by a variant or a switch. Docs (en, fr):
  CONTENT_GUIDE "Choosing the hero" (its voices and Studio paragraphs included), CLASSICS (Maniac Mansion, "Choose your hero at the start"), TOOLS (the lint row),
  UPGRADING §37 (a literal `{hero}` or `{word?…=…}` in a 4.2 text is now filled), DSL-STABILITY (the four admitted
  elements).
- **Step 6, voices by value**: `core/voice-key.ts` (`<id>~<flag>=<value>`, flags sorted, the plain id as the fallback,
  no keyed lookup while a flag is unset), the engine's lookup in `audio.voices` and `voicesByLang`, the recording table
  one row per value (`npm run voices`, the Studio's Voices tab), the validator's warning for a missing value's clip
  (`validate/voices.ts`), AUDIO.md "Lines with text switches". The fixture voices Grandma's dust line once per hero
  (`sneeze~form=knight|witch|robot`): each walkthrough hears its hero's clip; without the robot's, the validator warns
  and the plain id plays.
- **The Studio**: the Play tab's "Text switches" picker (the flag's value, `{hero}`'s name) and a preview line under a
  switched text in the Rooms tab (`src/studio/hero-picker.ts`, STUDIO.md).
- **Found by the fixture**: `npm run i18n -- status` listed a translation that adds a switch its source does not need
  (French agreement on an English line with none). The comparison now reports only a choice the translation drops (a
  flag, or a value neither listed nor covered by `*=`); an added switch or value is the translation's own.
- **Checks**: `npm run -s tsc -- --noEmit`; `npx vitest run tests/hero-choice.test.ts tests/lint.test.ts`;
  `npm run validate && npm run solve`; `npm run lint`; `npm run changes -- --check`; `npm run docs:truth`;
  `npm run format:check`; `npm run lint:code`; knip; `npm run -s test:node`.

→ next: 4.3.0's release checklist (the version, the golden save, UPGRADING §37's install line, SUPPORT, ROADMAP)
