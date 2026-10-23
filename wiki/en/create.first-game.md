# Your first game

The shortest path from nothing to a room you can play on your phone, with the files you touch named at each step.

<a name="overview"></a>

## What you will build

A game of one room from the template: a garden, a bucket, a gate. Take the bucket, use it on the gate, the end. You
add a lamp the hero can switch on, place it with the mouse, tell it in the storyboard, check the game with the
validator and the solver, and play it on your phone. The steps are planned for about fifteen minutes. Everything you
will write afterwards is a variation of what is already there.

**The content is data.** Rooms, props with states, characters, items, rules, conversations, hints, scripts and events
are plain TypeScript objects, with no code in them, so every tool can read, check and play them:

```ts
export const garden: RoomDef = {
  id: 'garden', name: 'The garden', decor: 'garden',
  props: { tank: { name: 'water tank', states: { full: 'tank_full', empty: 'tank_empty' } } },
  exits: { back_door: { name: 'back door', to: 'house', entry: 'garden' } },
  on: [
    { verb: 'use', a: 'pipe', b: 'tank', if: '!tank_drained',
      do: [{ minigame: 'pipes' }, { lose: 'pipe' }, { set: 'tank_drained' }, { prop: ['tank', 'empty'] }] },
  ],
  hints: [{ until: 'tank_drained', lines: ['Use the pipe on the water tank.'] }],
};
```

A rule is a verb, a target, a condition and a list of commands. What a game needs beyond them, a custom command, is
TypeScript of its own: trusted code, named in the game and hashed with it ([custom code](create.custom-code.md)).
Famous mechanics of the genre are written this way in [classic mechanics](create.classics.md). The Studio is the real
engine with an editor on top: rooms with their placements, the storyboard panel by panel, the checks after every
save ([the local Studio](studio.overview.md)).

**Art, sound and languages.** A prompt for every sprite sheet, object and backdrop in one style, and sheets cut into
sprites ([images](create.images.md)); chip-tune music arranged from a MIDI and sound effects from one palette
([music](create.music.md), [sound effects](create.sound-effects.md)); every line translatable, a missing translation
found before release ([translations](create.translations.md)).

<a name="what-you-need"></a>

## What you need

- Node 22.12 or later; Python 3 with Pillow for `npm run assets`
  (`pip install -r node_modules/quest-n-click/requirements.txt` in a created project, `pip install -r requirements.txt`
  in the engine repository). See [requirements](install.requirements.md).
- A phone on the same network, for the last step (optional).
- One of two places to work, the same steps in both ([which is which](create.project-layout.md)):
  - **a created project**, where the game is `game/`; this page's paths say `game/`;
  - **the engine repository**, where the game is `games/<id>/` (here `games/lamp/`).

<a name="steps"></a>

## Steps

<a name="from-the-template"></a>

### 1. A game from the template (one minute)

<!-- step: create -->
In a new folder of your choice, make a created project:

```sh
# anywhere on your machine: makes the folder my-game
npx create-quest-n-click my-game "My Game"     # or: npx quest-n-click create my-game "My Game"
cd my-game
npm install
npm run assets      # the placeholder art into public/assets
npm run dev         # http://127.0.0.1:5173/: a garden, a bucket, a gate
```

Until the packages are on npm, take the tarball a release attaches
([install from the release archive](install.from-archive.md)):

```sh
# anywhere on your machine
T=https://github.com/wanoo/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz
npx --package=$T quest-n-click create my-game "My Game" --engine=$T
```

Or, in the engine repository, the same template becomes `games/lamp`, set as the current game (`.cache/game`):

```sh
# in the engine repository
npm install
npm run new-game lamp "The Lamp"
npm run assets
npm run dev
```

You see a garden. The template is a complete game of one room. Its art is a placeholder drawn from shapes
(`tools/placeholder-art.py`): `provenance.json` says so, and a release refuses it until each file is replaced and
reviewed.

<a name="read-the-room"></a>

### 2. Read the room you are about to change (two minutes)

<!-- step: read-room -->
`game/rooms/start.ts` (`games/lamp/rooms/start.ts`) is the whole room. Read it top to bottom: `props` (things with an
image), `hotspots` (places on the backdrop), `look` (one line, or three that cycle, for each of them), `on` (the rules:
a verb, a target, a condition, what happens), `hints` (what the hint item says, until a flag is set), `onEnter`.
Geometry is not here: `layout/start.json` holds where things stand, and only the Studio or the placement editor
writes it ([geometry](create.geometry.md)).

<a name="add-a-prop"></a>

### 3. Add a prop and its rule (five minutes)

<!-- step: add-prop -->
Add a lamp to the garden. In `rooms/start.ts`:

```ts
props: {
  bucket: { name: 'bucket', img: 'starter/items/bucket' },
  lamp: { name: 'lamp', img: 'starter/items/bucket', states: { off: 'starter/items/bucket', on: 'starter/items/bucket' } },
},
look: {
  // …
  lamp: ['A garden lamp. Off.', 'Still off.', 'It is thinking about it.'],
},
on: [
  // …
  { id: 'start.light-lamp', verb: 'use', a: 'lamp', if: '!lamp_on',
    do: [{ set: 'lamp_on' }, { prop: ['lamp', 'on'] }, 'There. Light.'] },
],
```

The image is the bucket's for now (`npm run prompts` writes the prompt for a real one, and the Studio's Assets tab
cuts what you generate: [images](create.images.md)). A rule is a verb, a target, a condition and a list of commands; a
string in `do` is a line the hero says. `{ prop: ['lamp', 'on'] }` switches the prop's state, `{ set: 'lamp_on' }`
remembers it in the save ([reactions](create.reactions.md), [commands](create.commands.md)).

<a name="place-it"></a>

### 4. Place it (two minutes)

<!-- step: place -->
```sh
# in the created project, or in the engine repository
npm run studio      # the Studio opens; Rooms tab, "start"
```

The lamp has no place yet, so the Studio shows it at the default spot. Drag it where you want, drag its height, save:
`layout/start.json` gains a `lamp` entry. Never type coordinates by hand; the editor and the Studio exist for that.
Until it is placed, `validate` says `no position in the layout`.

<a name="story-then-check"></a>

### 5. Tell the story first, then check (three minutes)

<!-- step: story-check -->
`storyboard.json` is the source of truth for the text: add a panel to the garden board (`"action": "Use lamp"`, the
line the hero says) ([the storyboard](create.storyboard.md)). The Storyboard tab shows what is implemented and what is
not; the Check tab runs the validator and the solver after every save. From the terminal:

```sh
# in the engine repository
npm run validate   # a prop without a look line, a flag nothing reads, a rule nobody can reach: said here
npm run solve      # a way from New Game to the end, printed step by step; "softlock" if the player can get stuck
npm test           # the engine's tests and your game's walkthrough (games/lamp/tests/game.test.ts)
```

```sh
# in the created project
npx quest-n-click validate
npx quest-n-click solve
npm run verify     # validate, solve, i18n status, lint, playtests
```

A rule the solver never needs is not a bug (the lamp is decoration), but `npm run lint`
(`npx quest-n-click lint`) tells you it is decoration ([checking your game](create.checking.md)).

<a name="play-on-your-phone"></a>

### 6. Play it on your phone (two minutes)

<!-- step: play-phone -->
```sh
# in the engine repository
npm run dev:lan     # the dev server on your network; open the printed URL on the phone, landscape
```

A created project has no `dev:lan`: [testing on a phone over the LAN](create.lan-testing.md) says how to do it there.
Tap the lamp with Use. The line shows, the prop changes, and the save remembers it when you reload.

> [!LIMIT id=tutorial-scope]
> This tutorial leaves out the art (the lamp keeps the bucket's image), the map, characters and conversations, and
> publishing. Each has its page below.

<a name="what-you-learned"></a>

## What you learned

That is the loop: write a rule, place it, check, play ([the working loop](create.working-loop.md)).

- A room is data: props, hotspots, look lines, rules ([rooms](create.rooms.md)).
- Geometry lives in `layout/`, placed with the mouse ([geometry](create.geometry.md)).
- The validator and the solver check the game after each change ([checking your game](create.checking.md)).

<a name="next"></a>

## Where to go next

- [Rooms](create.rooms.md), field by field; [reactions](create.reactions.md); [commands](create.commands.md);
  [conditions](create.conditions.md).
- [Classic mechanics](create.classics.md): famous puzzles written with these fields.
- [The local Studio](studio.overview.md), and [puzzle design](create.puzzle-design.md) for a whole game from the
  first idea to the release.
