# Plan — 4.3 "Hero Choice": pick the hero's look and voice at New Game

Status: **proposed**, waiting for the maintainer's answers (§8). Nothing is implemented yet.

## 1. The need

The maintainer's next game lets the player choose a male or a female hero at the start. The hero keeps the same
role, puzzles and rooms; what changes is how the hero looks, what the hero is called, and how other characters
talk to and about the hero (he/she, him/her, and in French the agreement: *content / contente*).

## 2. What 4.2 already does, and where it stops

| Need | 4.2 today | Gap |
|---|---|---|
| Ask the player | `start.intro` with `{ choice: […] }`, each answer `{ set: ['form', 'f'] }` | none |
| Prove both heroes finish | the solver branches over the intro's choices (`tools/solve/search.ts:257`) | none |
| Another look | `CharacterDef.variants[]` with `if: { flag: 'form', eq: 'f' }`: sprites, mouths, portrait, palette (`core/world-queries.ts:40`) | none |
| Another name | `name` is not in a variant; `nameOf` and the speech box read `game.characters[id].name` directly | **missing** |
| Gendered lines | only by duplicating each line under an `if` (and each choice option, each topic, each look) | **unworkable** past a few lines, and doubled again by every translation |
| Choose from portraits | a `choice` shows text lines only | nice to have |

Compositions tried and why they fall short (the admission file of §2.3, PLAN-4.1.19):

- **`players` with two heroes**: the tools row always shows a switch button per playable character
  (`dom/shell.ts:73`), so the player could swap heroes mid-game; the other hero would also stand idle in the start
  room. Wrong tool.
- **A Remix dimension** (`presentation` or a logical one): Remix chooses a *world* from a seed, before New Game,
  shared by a link and recorded in speedrun categories; its placeholders are filled **once at boot**
  (`core/remix/apply.ts:216`). The hero choice belongs to a save, not to a world: two saves in the same world can have
  two different heroes. Wrong layer.
- **Duplicated lines under `if`**: works, but every gendered line becomes a branch, every translation must follow the
  branch structure, and `npm run ids` gives each copy its own id. Fragile at the size of a real game.

## 3. The design: three small, additive pieces

Everything is optional and presentation-only: no new condition, no new command, no new state, no save migration,
`schemaVersion` stays 3. Under strict SemVer since 4.2 this is a **minor** release (4.3.0).

### 3.1 `name` in a character variant

```ts
hero: 'sam',
characters: {
  sam: {
    name: 'Sam', sprites: cat('sam'), mouths: …, portrait: 'sam/portrait',
    variants: [{ if: { flag: 'form', eq: 'f' }, name: 'Samia', sprites: cat('sam_f'), mouths: …, portrait: 'sam_f/portrait' }],
  },
},
```

- `character()` (`core/world-queries.ts:40`) merges `name` like the other fields.
- `nameOf()` reads characters through `eng.character(id)` instead of `game.characters[id]`.
- The speech box, transcript, live region and talk header (`dom/speech.ts:19,26,66,77`) read the name through
  `app.engine.character(who)`. Same audit for the other direct reads (`tools/puzzle.ts`, `tools/coverage.ts`: they
  stay on the written name, which is right for tools).
- Works for any character, not only the hero (a character renamed after a reveal).

### 3.2 Text switches, filled when a line is shown

Two placeholders, usable in **any** text the player reads (lines, choices, looks, hints, toasts, objective titles):

| Placeholder | Becomes | Example |
|---|---|---|
| `{hero}` | the active hero's name, variant included | `Good morning, {hero}!` |
| `{<flag>?<value>=<text>\|…\|*=<text>}` | the text listed for the flag's current value; `*=` is the fallback | `Grandma hugs {form?m=him\|f=her}.` · fr: `Tu es content{form?f=e\|*=} ?` |

- **Generic, not gendered**: the switch reads any flag, so the same tool serves three or more forms (a neutral
  hero: `{form?m=he|f=she|n=they}`) and other needs (a title that changes after a promotion).
- **When**: at display time, in one function `eng.text(s)` (core) called right before `ui.say`, `ui.choose`,
  `ui.toast` and by the DOM for objective titles. After `fill()` (`{item}`, `{target}`, `{name}`) and after the
  translation, so each language writes its own words inside the braces. Never at boot: the flag lives in the save.
- **Syntax distinct from what exists**: `{code:…}` / `{hint:…}` (Remix, boot), `{item}` / `{target}` / `{name}`
  (fallbacks). The `?` marks a switch; `hero` becomes a reserved placeholder word.
- **Unknown or unset**: no matching value and no `*=` shows the first listed text (never raw braces on screen);
  the validator makes that case an error anyway (§5).

### 3.3 Portraits in a choice (optional, UI only)

A choice option gains `img?: Id`. The choice panel shows options with an image as large tappable cards (two
portraits side by side on a phone) instead of text lines. Without `img`, nothing changes.

```ts
start: { room: 'bedroom', intro: [
  'Who am I this morning?',
  { choice: [
    { text: 'Sam', img: 'sam/portrait', do: [{ set: ['form', 'm'] }] },
    { text: 'Samia', img: 'sam_f/portrait', do: [{ set: ['form', 'f'] }] },
  ] },
] },
```

The intro runs before the first room's arrival (`core/engine.ts:316`), so the hero is chosen before anyone talks.
The flag is set once; nothing in the engine lets the player change it later unless the author writes it.

## 4. What it does not change

- **Logic**: switches are text; the solver, the proof, replays and sessions are untouched. Both heroes are already
  proved by the intro-choice branching. A condition that must differ by hero uses `{ flag: 'form', eq: 'f' }`, as
  today.
- **Saves**: the choice is an ordinary flag. Checkpoints take `flags: { form: 'f' }`.
- **IR / fingerprint**: `variants` is already classed `presentation` (`core/ir-fields.ts:162`); text and choice `img`
  are presentation too. The logic fingerprint of an existing game does not move.
- **Remix, speedrun**: untouched. A speedrun category may later name the form; not in this release.
- **Voices**: a voiced line has one clip per id. Per-form clips are deferred (§7); the validator warns when a voiced
  line contains a switch.

## 5. Tools

| Tool | Change |
|---|---|
| Types + `ir-schema.ts` | `variants[].name?`, `Choice.img?`; the switch grammar documented in `DSL.md` |
| Validator | malformed switch; a flag no command sets; a value listed that no `set` writes; a value written by a `set` that a switch neither lists nor covers with `*=`; `{hero}` outside a game with a hero; a voiced line with a switch (warning); a choice `img` that is not an image id; the same switch flag and value set in every locale (`npm run i18n -- status`) |
| Lint | a character variant whose `name` is set but never shown (no `{hero}` and not a speaker) — info only |
| Solver | N/A (text). A test asserts the intro choice still branches with `img` present |
| Studio | the text editor shows the raw braces; the Play tab gets a "form" picker (a flag value) to preview each hero |
| MCP | `set_text` accepts switches (validated like the Studio); no new tool |
| i18n | `extract` keeps braces intact; `status` flags a translation missing a switch the source has |
| Template / docs | `_template` untouched; CONTENT_GUIDE (en, fr) "Choosing the hero"; CLASSICS entry; DSL.md regenerated; UPGRADING §34; DSL-STABILITY; `tests/api-surface.json` grows |

## 6. Work, in pull requests

Following D33's gate (§2.3): a dedicated branch and **ADR 0022** (reserved for the first DSL extension, still vacant).

1. **ADR 0022 + this plan** (no code): the admission file (§2 above), the syntax frozen.
2. **Variant `name`**: types, schema, `character()`, `nameOf()`, `dom/speech.ts`; tests (engine: the speaker label
   and `{name}` in a fallback follow the variant).
3. **Text switches**: a pure parser in `core/text-switch.ts` (no DOM), `eng.text()` at every display site, validator
   rules, i18n status; property tests (any switch renders to text without braces; a string without `{…?` is returned
   unchanged, byte for byte); engine tests on say / choose / toast.
4. **Choice portraits**: `img` on options, the DOM cards (keyboard and screen reader: the option's `text` is the
   label), a phone screenshot of the intro.
5. **Fixture + docs**: a small fixture game in `tests/fixtures/` (two forms, an fr locale, a voiced line), the
   walkthrough for both forms, the docs of §5, UPGRADING, the LOG entry; then 4.3.0's release checklist.

Each PR: `npm run validate && npm run solve && npm test`, `npm run build`; PR 4 also a screenshot at phone size.

## 7. Deferred

- **Per-form voice clips** (`audio.voicesByForm` or a variant `voices` map): only if the game is voiced.
- **A dedicated New Game screen** (choose the hero on the title screen, before the intro): the intro choice with
  portraits covers it without a new screen; revisit if the title screen needs it.
- **Speedrun categories by form.**

## 8. Questions for the maintainer

1. Is the switch syntax `{form?m=him|f=her}` readable enough for you and a translator? Alternatives:
   `{form: m=him | f=her}` or `{m:him|f:her}` (shorter, but then the flag name is implicit and fixed).
2. Choose the hero with portraits (3.3) or is a text choice enough?
3. Two forms only, or should the docs show a third (neutral) one as the example?
4. Will the game be voiced? (Decides whether per-form clips move out of §7.)
5. Same hero name for both, or one name per form?
