# Upgrade notes: 4.6

TODO(release): name 4.6.0 in this lead.

What 4.6.0 "Routes" changed. Nothing to change in a game: it builds, plays and saves as on 4.5.6. A game that
declares no route has no world clock, so its logic fingerprint, its golden saves and its sessions stay the same.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-5-6-to-4-6-0"></a>
<!-- applies: 4.6.0.. -->

## From 4.5.6 to 4.6.0 "Routes"

Install `@quest-n-click/engine@4.6.0` ([Install from npm](install.from-npm.md)). What a game may use, each optional:

- **Routes** ([Routes](create.routes.md), ADR 0031): a game script with `route: { who, from, steps }` walks a
  character from point to point and through exits, on the world's clock, shown or not. The player's click holds it, a
  shut exit holds it, and `while` false holds it where it is.
- **`suspendScript` and `resumeScript`**, for any script: a suspended script keeps its step, and a suspended route
  also keeps its place and the wait left.
- **Route points in the layouts** (`points`), placed in the editor under "Entry and route points".
- **`validate`, the lint and the solver know routes**: four lint codes (`route-script-conflict`,
  `route-never-starts`, `route-blocked-forever`, `route-resume-misplaced`), and a "Route <id>" choice in the
  solver's paths.
- **A portrait layout for a phone held upright** (`skin.portrait: true`, [Skin and fonts](create.skin-fonts.md#skin-other)):
  the scene on top, the verbs, the bag and the tools below, instead of the "rotate your phone" overlay. Off by default:
  a game that does not set it shows the overlay as before, and the landscape and desktop layouts are unchanged.
- **The navigation moved into the core** (`@quest-n-click/engine` `core/nav/walk.ts`); the player re-exports it, so an
  import from `dom/walk` still works.

**For a game that uses routes**, a save gains `world` and `scripts.<id>.route`, and a session gains `wt` and the
entries `{ world }` and `{ routeDo }`. A 4.5 save loads (its routes begin from it), but a 4.5 engine does not
understand a 4.6 session with routes.

**For the TypeScript of a project**, `ScriptDef` is now a union, `CmdScriptDef | RouteScriptDef`. Code that read
`script.do` on any script checks first that it is a script of commands (`if (s.do)`); a room's `scripts` stay
`CmdScriptDef[]`.

**For contributors**, the 131 mutation exemptions due at 4.6.0 were read again (`docs/dev/MUTANTS.md`), and CI has a
`routes` job (Chromium and WebKit).

<a name="from-4-5-6-to-4-6-0"></a>
<!-- applies: 4.6.0.. -->

## From 4.5.6 to 4.6.0 "Routes"

TODO(release): what changes in a game ("Nothing to change in a game: it builds, plays and saves as on 4.5.6" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:

- **A spans.json key with an emoji names its file (4.6.0)**: a key of a game's own `spans.json` holding a character
  outside the Basic Multilingual Plane (`notes/😀.md`, or `docs/😀*`) never matched its own file, so the Studio said
  the file belonged to no span. Such keys now match like any other.
- **The title screen follows a resize (4.6.0, #397)**: turning a phone or resizing the window while the title screen
  showed laid out the game's screen under it (the scene sized for the right-hand column, the column hidden); the title
  now lays itself out again, its logo, buttons and footer included.
- **A reload during the New Game intro no longer skips it (4.6.0, #401)**: the autosave was written before the intro
  ran, so a reload while the intro's `choice` was open (the hero choice of `games/heroes`) left a Continue that
  resumed the first room with the hero's flag unset, and the player was never asked. A game with a `start.intro` now
  writes its autosave once the intro has ended, or once it hands the player the game with a tutorial step (`guide`,
  as the sample game's intro does): a reload before that leaves nothing to continue, and New game plays it again. A
  game without an intro saves at the start, as before. The save format is unchanged.
- **Main green again after the routes (4.6.0, #403)**: the nightly's gated `core` mutation set left four mutants
  unexplained on the routes' side of `save.ts` and `session-runtime.ts`, and the `coverage` ratchet refused
  `world.ts`'s branch floor. `tests/route-runtime.test.ts` and `tests/routes-game.test.ts` join `TESTS.core`, two
  tests pin a save held at a closed exit and a replayed entry's last recorded tick, and the floor is 86. `core`:
  435/438, the 3 survivors explained. Nothing changes for a player, an author or a host.
- **The routes example's e2e meets Lou at his desk (4.6.0, #394)**: `games/routes/e2e.mjs` took Lou's map and talked
  to him as soon as Pixel came in, near the end of his first paperwork, when he was already walking to the door: on
  CI's slower WebKit runner the tap aimed at him landed where he was, or after he left, and the conversation never
  opened (`routes (webkit)` red on 3 of the 15 runs that played it since d4117b15, main among them). Each check now waits for a
  paperwork just begun, Lou standing still at his desk for 2.5 s. The engine was right: a tap that meets a walking
  Lou holds him. Nothing changes for a player, an author or a host.
- **Each heavy attempt of the candidate runs in three shards (4.5.7, #392)**: the candidate's `heavy` job ran the whole
  solver suite three times, each attempt on one runner – up to 44 minutes each, the candidate's critical path. It keeps
  its three attempts, and each is now cut in three shards by the files' recorded durations (`tools/heavy-shards.ts`,
  `tools/heavy-durations.json`), one runner each, one file after the other: nine jobs of about 15 minutes.
  `tests/heavy-shards.test.ts` pins that the shards cover `test:heavy`'s list with no file missing or doubled. The
  release's baseline and the candidate's summary rebuild each attempt from its three reports (`heavy-<a>-shard-<s>`);
  an attempt with a shard missing is "not measured". The nightly's single heavy run now keeps its JSON report
  (`heavy-nightly`).
- **Routes: any character walks its rounds through rooms, seen or not (4.6.0, ADR 0031, D58)**: a game script with
  `route: { who, from, steps }` walks a character to points of the layouts (`Layout.points`, placed in the editor),
  waits, and goes through exits into the next room, on the world's clock, in 50 ms ticks, whether its room is shown or
  not. A click on the character holds it from the hero's approach to the end of the exchange while the other routes go
  on; a shut exit holds it at the door until it opens; its arrival commands (`do`) run one route at a time, never during
  the player's action. The world stands still in the pause menu, cutscenes, minigames, room transitions and while the
  page is hidden, with no catching up. A game without routes has no world: its fingerprint, saves and sessions are
  those of 4.5.6. The example is `games/routes` ("Lou's Rounds"), played in Chromium and WebKit by its own CI job.
- **`suspendScript` and `resumeScript` (4.6.0)**: suspend any script where it is and resume it; a route keeps its
  step, its place and the wait left, starting another route of the same character suspends the first, and a resume
  away from the room of the suspended step is refused and reported (`route-resume-misplaced`).
- **Saves and replays keep the world (4.6.0)**: a save holds the clock (`world`) and each route's progress
  (`scripts.<id>.route`, `paused`); a session records the clock at each sync point of an entry (`wt`) and two new
  entries, `{ world }` (time let pass) and `{ routeDo }`. A replay runs the world to each recorded tick first. Saves of
  4.5 load, and their routes begin from them.
- **validate, the lint and the solver know routes (4.6.0)**: `validate` checks each step in the room it is walked in
  (point, exit, actor), a loop that comes back to its first room and makes progress, one automatic route per
  character; the lint adds `route-script-conflict`, `route-never-starts`, `route-blocked-forever` and, after a search,
  `route-resume-misplaced`; the solver lets time pass until a route's next stop ("Route <id>") and keys a state on each
  route's step and how it stands, never on its position inside a walk (the proof is of the stops, not of the timing).
- **The path finder moved into the core (4.6.0)**: `WalkArea` and `WalkTopology` are `core/nav/walk.ts`, shared by the
  view and the routes; `dom/walk.ts` re-exports them.
- **The 131 mutation exemptions read again (4.6.0)**: each entry of `docs/dev/mutants.json` came due at 4.6.0 and was
  checked against the code. All 131 still hold: no test can tell one of these mutants from the original. Four reasons
  are sharpened (a run's verdict, a badge connector's `resolve`, a game session's second expiry boundary, a spans
  glob's literal token). The 131 are read again at 4.7.0.
- **The hero choice screen: a choice shown full screen, the heroes standing in a scene (4.6.0, #398)**: a
  `{ choice }` command takes `screen: { decor, title? }`. The choice then covers the whole scene, over its own
  backdrop, the side column hidden, the title on top; each option with an `img` stands on the backdrop, side by side
  at one height, its text under it, and the options without one are buttons under them. One tap picks, and the pick is
  not said back by the hero. It is a group named by the title, one button per hero named by its text, the first
  focused, the arrow keys between them; the heroes rise into place, still with reduced motion. Presentation only: the
  options, what they run and the recorded pick are those of the same choice without `screen`, so the solver and the
  proof branch over it, saves and replays do not see it, and the IR leaves it out (the logic fingerprint does not
  move; the presentation one carries it). `validate` checks the backdrop and the title and warns of an option without
  an `img`; the title is translated (`start/intro[0].screen.title`) and its switches filled; the asset graph preloads
  the backdrop with the intro and `npm run assets` prepares it; the Studio's form offers it. A choice without `screen`
  is what it was. The example `games/heroes` now asks with it (wiki/en/create.heroes.md#hero-choice-screen).
- **A portrait layout for a phone held upright, opt-in per game (4.6.0, #397)**: a game that sets `skin.portrait: true`
  no longer shows the "rotate your phone" overlay on a screen taller than wide. The scene goes on top, as wide as the
  screen and at its 16:10; below it a panel holds the sentence line, the verbs (3 columns), the bag (4 columns), its
  page buttons when needed and the tools row (map, pause, music) at the bottom, every button 44 px or more. The panel
  fits its height with the landscape column's rules (`side-fit.ts`); only a nearly square screen (a foldable, a split
  screen) narrows the scene, down to 60% of the width (`dom/portrait-fit.ts`, pure and tested). The scene's size depends
  on the screen alone: a full bag on a short screen shrinks the panel's buttons, as the column does, and never moves the
  scene. Conversation choices and the map's places take the panel as they take the column; the pause menu, settings,
  save slots and confirmations take the whole screen inside the safe areas, with 44 px rows; the title screen puts its
  buttons under the picture. Turning the phone switches layouts as the game plays, its state untouched, the title screen
  included. A game without the field is unchanged, overlay included, and the landscape and desktop layouts measure the
  same as before. The validator wants `true` or `false`. `npm run e2e:portrait` measures it on the sample game.
- **Pull requests no longer rewrite figures every other pull request rewrites (4.6.0, #405)**: `npm run
  quality:baseline` now writes the behaviour only (the games' witnesses and proofs, the golden saves, the API's hash,
  and the README's reference-proof figure when it moves). The test counts, the first visit's JavaScript and the
  READMEs' other figures and install line are written by the release (`npm run quality:baseline -- --release --dist`,
  the `quality baseline` step of `npm run release -- prepare`, after a build). `--check` still fails on a behaviour
  change and on fewer test declarations; more tests and a first visit that moved are warnings, the first visit in
  bytes ("+200 bytes since the release"). The first visit is gated by each game's `assetBudgets.initialJsKB` only,
  compared in bytes (`initialJsKB` × 1024) instead of rounded to the KB: one byte over fails, wherever the rounding
  would have put it. The sample games' budgets keep a margin of about 2 KB, which each release resets on purpose: the
  demo stays at 140 (138.1 KB measured), the reference chapter goes from 143 to 145 (142.8 KB). The coverage floors
  move from `vite.config.ts` to `tests/coverage-floors.json`, which `vite.config.ts` reads and the mutation cache does
  not hash: raising a floor re-runs no mutation set. This change edits `vite.config.ts` once more, so every set's cache
  key moves this one time. Nothing changes for a player or an author whose game sits under its budget; a game whose
  first visit sat within 0.5 KB over its `initialJsKB` passed before and fails now.
