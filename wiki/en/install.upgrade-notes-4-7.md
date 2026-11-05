# Upgrade notes: 4.7

What 4.7.0 changed. Nothing to change in a game: it builds, plays and saves as on 4.6.0. Every addition is optional;
all but the end's `keepPlaying` are presentation only, unseen by rules, saves and the solver.

The upgrade itself is [Upgrade](install.upgrade.md).

<a name="from-4-6-0-to-4-7-0"></a>
<!-- applies: 4.7.0.. -->

## From 4.6.0 to 4.7.0

Install `@quest-n-click/engine@4.7.0` ([Install from npm](install.from-npm.md)). What a game may use, each optional:

- **A character turns back** once the hero is done with it: `turnBack: true` on the room's actor
  ([Rooms](create.rooms.md#actors)).
- **The title screen's logo and buttons placed by the game**: `titleScreen` takes `logoWidth`, `logoCenter`, `logoTop`
  and `buttonsTop`, in units of the 640 x 400 scene ([Title and credits](create.title-credits.md)). A logo padded with
  transparent space to place it can lose its padding.
- **Travel on foot on the map**: `vehicle: 'walk'` on a place walks the hero along the route with their `walk` frames
  ([World map](create.world-map.md)).
- **A map without pins, or with small dots**: `map.pins: 'hidden' | 'dots'`, for a map whose picture draws its places
  ([World map](create.world-map.md#bare-pins)). The default, `'faces'`, is as before.
- **A region's `frame` is drawn**, outlined on the parent's image once the region is open
  ([World map](create.world-map.md#regions)). Remove a frame painted into the parent's image.
- **Images per language**: `i18n.images` in `game.ts` names, for an image id, the image each language draws in its
  place ([Translations](create.translations.md#i18n-images)).
- **An end that rolls the credits, shows the title, and lets the world go on**: `{ end: true }` takes `credits`,
  `title` and `keepPlaying` ([Title and credits](create.title-credits.md#end-of-chapter)). With `keepPlaying`, the end
  is still reached and saved, but a load puts the player back in the world after it. A plain `{ end: true }` is
  unchanged.
- **The page's title and description per language**: `site.json` takes `i18n`, the `title`, `shortName` and
  `description` in the game's other languages ([Layout of a created project](create.project-layout.md#site-json)).

**For the TypeScript of a project**, additions only: `quest-n-click/player` exports the types `SiteText`, `SiteTexts`
and `EndShow`; `Presenter.end` takes an optional `EndShow`, and `GameState` an optional `keepPlaying`.

**Fixed**: a thing's name shown on hover stays inside the scene near its left or right edge, and the travel map shows
a child region only once a place in it, or below it, is unlocked (it offered an empty region from the start).

**Supported versions** change: only the latest minor gets fixes from 4.7.0, security fixes included; 4.6 gets none, so
upgrade. The windows promised before keep their dates ([Stability and support](start.stability.md#versions)).

**For the maintainers**, the release commands retry git's network steps and say the way on after a failure, and
`prepare` moves the versioned locks' engine peer on a new minor. **For contributors**, the `routes` mutation set is
gated, CI's `external-consumer` job asks for no runner when the plan spares it, and the coverage ratchet is strict on every
pull request (`npx tsx tools/coverage-ratchet.ts --write` raises the floors it names).

<!-- prepare (#410): this section was written before the release. The release's CHANGELOG bullets, to check it against; delete this comment once read:

- **A thing's name stays inside the scene (4.7.0, #414)**: the yellow name shown above a thing on hover (or for a
  moment after a tap on a phone) was centred on it whatever its place, so a thing near the left or right edge had its
  name cut by the edge ("path to Le F"). The name now moves inward just enough to show whole, a few units from the
  edge, and stays centred on the thing when there is room. In a wide room it is kept inside the visible scene.
- **A child region of the map shows once it is open (4.7.0, #421)**: the travel map offered the zoom button to a child
  region from the start, even with none of its places unlocked, which spoiled what comes and led to an empty map. A
  child region now shows only once a place in it, or in a region below it, is unlocked. The region the map opens on
  stays reachable, and the way back up is always there. A region in the middle of three levels has both buttons, the
  way down above the way up (it had only the way up).
- **The routes e2e saves and reads in one step (4.7.0)**: its reload check saved, then read Lou's state in a second
  evaluation, so the world's clock could tick in between, and a correct reload at the saved tick failed against the
  tick after it (#438's `routes (webkit)`). The test only; the engine's saves were right.
- **The release commands go on through a passing failure and say the way on (4.7.0, #410)**: what stopped or misled
  4.6.0's release, each fixed in the command. Git's network steps (`git fetch` in `prepare` and in
  `npm run release -- <v>`, `ship tag`'s fetches and tag push) are tried four times, 15 s apart, before stopping. A
  release run where no job ran (run 41819835975: its `release` job never created) is re-run whole
  (`gh run rerun <id>`), `--failed` only when a job failed. A candidate red twice names
  `npm run release -- <v> --commit=<the fix's merge sha> --start-candidate` for a fix merged on main. On `release/<v>`
  the refusal gives `git switch main && git pull --ff-only <remote> main`, and `prepare` ends by saying it.
- **`prepare` updates what follows from the version (4.7.0, #410)**: the versioned locks' engine peer
  (`scripts/locks/quest-n-click-studio-server.json`, `"@quest-n-click/engine": "N.M.x"`) follows a new minor, that
  field only; an upgrade-notes section written ahead (`from-<prev>-to-<v>`) is kept, the CHANGELOG bullets in a comment
  at its end, no `TODO(release)` added, and a lead that names the version is left alone.
- **A character turns back to its side once the hero is done with it (4.7.0, #417)**: a character the hero looks at,
  talks to or gives something to turns to face the hero, and stayed so. With `turnBack: true` on the room's actor, it
  turns back once the action is over (a conversation at "Bye") to the side it stands facing: a `face` command's, else
  `facing`, else the layout's mirror. E.g. two players facing each other across their game. Presentation only: rules,
  saves and the solver do not see it.
- **The title screen's logo and buttons placed by the game (4.7.0, #418)**: `titleScreen` takes `logoWidth`,
  `logoCenter` and `logoTop` (the logo's width, the x of its centre, the y of its top) and `buttonsTop` (the y of the
  top of New game and Continue), all in units of the 640 x 400 scene. A game no longer pads its logo image with
  transparent space to size and place it, and can move the buttons. Without them, the title is as before. Upright
  (`skin.portrait`), the buttons stay below the picture: `buttonsTop` applies only sideways.
- **A region's `frame` is drawn (4.7.0, #421)**: `frame: [x, y, w, h]` was documented but drawn by nothing, so games
  painted the area into the parent's image, where it showed from the start. The map now outlines it on the parent's
  image, in the zoom button's yellow, once the region is open. Remove a frame painted into the image.
- **Travel on foot on the map (4.7.0, #422)**: `vehicle: 'walk'` on a place sends the hero walking along the route
  instead of a car: the character the player plays now, as the room draws them (the variant that applies, so the hero
  chosen at New Game), with their `walk` frames at their `fps`, flipped when the way goes left, and `walk_back` or
  `walk_front` on a mostly vertical stretch when the sheet has them. The walker is 12% of the map's height, feet on the
  route; the journey still lasts 1.6 s. A hero with no `walk` frames travels by car. Presentation only: rules, saves
  and the solver do not see it.
- **The `routes` mutation set is gated (4.7.0, #413)**: its 53 survivors of the 4.6.0 nightly are read, 49 killed by
  tests and 4 named in `docs/dev/mutants.json`, so a survivor nobody named now fails its job like every other set's,
  and `MEASURED` is empty again. The new tests pin what a route does with a character that has no actor or no
  position in a room, a walk that ends exactly on its point or at the foot of a ladder, a wait of exactly one tick, a
  save whose step is past the last one, and a game without routes that never loads the routes' engine. Nothing changes
  for a player, an author or a host.
- **`external-consumer` asks for no runner when the plan spares it (4.7.0)**: a pull request that changes no package,
  template or authoring path skips the job at the job level instead of starting a macOS, a Windows and a Linux runner
  only to say "not needed by the plan"; `pr-gate` accepts that skip exactly when the plan spares it. On 4 November no
  macOS runner came all afternoon, and every pull request waited 15 minutes on one before failing.
- **A map without pins, or with small dots (4.7.0, #428)**: `map.pins` says how the places are marked, for a map whose
  picture already draws them. `pins: 'hidden'` takes the pins away: each place is still a button, named for screen
  readers, the size of a face and centred on its `pos`, but transparent; its "!" still shows there and the keyboard
  focus rings it. `pins: 'dots'` puts a small token in each of those buttons (a stone-coloured disc with a soft shadow,
  or the image `map.vehicles.dot`), glowing warm on hover and focus, and the hero the player plays now standing on the
  current place instead of its token (their `idle` frame, the variant and palette that apply); when the player travels,
  the walker or the vehicle takes over and the hero stands on the new place on arrival. With both, places that join
  one pin get one button each, the route runs from spot to spot, the "Where to?" list is unchanged and `portrait` is
  not drawn. The default, `pins: 'faces'`, draws the pins as before; the validator refuses another value. Presentation
  only: rules, saves and the solver do not see it.
- **Images per language (4.7.0, #430)**: `i18n.images` in `game.ts` names, for an image id, the image each language
  draws in its place (`{ 'logo/r1c1': { fr: 'logo/fr', es: 'logo/es' } }`): a title logo lettered in each language, a
  sign. The content keeps the source id; wherever it is drawn (title screen, rooms, props, icons, map), the language
  being played draws its variant, and the game's own language draws the source. The offline cache keeps every
  variant, so switching language offline still finds them. The validator checks every id and warns of a variant that
  is never drawn (the game's own language, a language the game does not ship). Presentation only: rules, saves and the
  solver do not see it.
- **The page's title and description per language (4.7.0, #431)**: `site.json` takes an optional `i18n`, the
  `title`, `shortName` and `description` in the game's other languages (`"i18n": { "fr": { "title": "…" } }`). When
  the page plays one of them (`?lang=`, Settings, the browser's language), the tab's title, the description and the
  install name (a `manifest.<lang>.webmanifest` per language) are that language's; the Language row of Settings
  reloads the page, so they follow it. The HTML as served, which link previews read, stays in the game's own language.
  `BootOptions.site` passes the texts for an embedder with its own page. API: `quest-n-click/player` exports the types
  `SiteText` and `SiteTexts` (additions only).
- **Only the latest minor is supported (4.7.0, D59)**: it gets every fix, security fixes included; an earlier minor
  gets none, and the way to a fix is to upgrade, a minor only adding. The three months of security fixes each minor
  had after the next one end with 4.6: the windows promised before 4.7.0 keep their dates (4.5 until 4 February 2027,
  4.4 until 23 January 2027, 4.3 until 22 January 2027, 4.2.5 until 21 January 2027). Stability and support, the
  security policy and `SECURITY.md` give the same table.
- **A README that reads in five minutes (4.7.0)**: both languages rewritten around what a newcomer asks, in order:
  what it is, how to start, a taste of the code, the features, how stable it is, where to go next by audience. About
  1,000 words instead of 2,500; the install block, the stability table and the figures are unchanged. The releases'
  history leaves it for the CHANGELOG: `npm run release -- prepare` now replaces the README's current-release line
  instead of keeping each previous summary below it.
- **An end that rolls the credits, shows the title, and lets the world go on (4.7.0, #437)**: `{ end: true }` takes
  `credits` (the game's `credits` roll, as from the pause menu; a tap ends them sooner), `title` (then the title
  screen) and `keepPlaying`. With `keepPlaying`, the end is still reached and saved (the solver's goal, the replays,
  `endingReached`), but a load (Continue, a save slot) clears it: the player is back in the world after the end, its
  rooms, scripts and sequences running. Before, a loaded end left a world where room scripts never ran and every
  sequence stopped after its first command. A plain `{ end: true }` is unchanged. The validator refuses `credits`
  without `credits` lines; the Studio's form has the three switches; `FakePresenter` logs `END`, then `CREDITS` and
  `TITLE`. API: `Presenter.end` takes an optional `EndShow` (`{ credits, title }`), exported from
  `quest-n-click/player`; `GameState.keepPlaying` (optional). Additions only.
- **The coverage ratchet is strict on pull requests, warns in the candidate, and writes its fix (4.7.0, #410)**:
  `coverage-ratchet --strict` ran only off pull requests, so a pull request that lifted the coverage merged green and
  main turned red after it (#425's routes tests, three floors), or the candidate stopped on it (#411). Now the
  `coverage` job is strict on every pull request as on main, `release-check:ci` only warns (a floor too low is no defect
  of a release), and `npx tsx tools/coverage-ratchet.ts --write` raises each floor it names to two points under the
  measure, rounded down, in `tests/coverage-floors.json`. The floors follow #425: `route-runtime.ts` and `world.ts`
  branches 95 and 96, total functions 72 and statements 75.
-->
