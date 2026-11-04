# Upgrade notes: 4.6

What 4.6.0 "Routes" changed. Nothing to change in a game: it builds, plays and saves as on 4.5.6, unless its first
visit sat within half a kilobyte over its `initialJsKB` budget (below). A game that declares no route has no world
clock, so its logic fingerprint, its golden saves and its sessions stay the same.

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
- **A hero choice screen** (`{ choice, screen: { decor, title? } }`, [Heroes](create.heroes.md#hero-choice-screen)):
  the choice covers the scene over its own backdrop, each option with an `img` standing on it side by side, and one
  tap picks. Presentation only: the solver, the saves and the logic fingerprint see the same choice as without
  `screen`, and a choice without it is unchanged.
- **The navigation moved into the core** (`@quest-n-click/engine` `core/nav/walk.ts`); the player re-exports it, so an
  import from `dom/walk` still works.

**For a game that uses routes**, a save gains `world` and `scripts.<id>.route`, and a session gains `wt` and the
entries `{ world }` and `{ routeDo }`. A 4.5 save loads (its routes begin from it), but a 4.5 engine does not
understand a 4.6 session with routes.

**For the TypeScript of a project**, `ScriptDef` is now a union, `CmdScriptDef | RouteScriptDef`. Code that read
`script.do` on any script checks first that it is a script of commands (`if (s.do)`); a room's `scripts` stay
`CmdScriptDef[]`.

**For a game with a New Game intro** (`start.intro`), the autosave is written once the intro has ended, or once it
hands the player the game with a tutorial step (`guide`), no longer before it ([Saves](play.saves.md#autosave)): a
reload during the intro leaves nothing to continue, and New game plays it again. Nothing to change; the save format
is the same.

**For a game's first-visit budget**, `assetBudgets.initialJsKB` is now compared in bytes (`initialJsKB` × 1024), no
longer rounded to the kilobyte ([Images](create.images.md#images)). A game whose first visit sat up to half a kilobyte
over its budget passed on 4.5.6 and fails `npm run verify:dist` (so `npm run build`) on 4.6.0, its message giving the
bytes over: raise the budget or lighten the first visit. The sample games keep a margin of about 2 KB, which each
release resets: the demo stays at 140, the reference chapter goes from 143 to 145.

**Fixed**: turning a phone or resizing the window while the title screen shows lays the title out again, and a key of a
game's `spans.json` with a character outside the Basic Multilingual Plane (an emoji) now matches its file in the
Studio.

**For the maintainers**, the release writes the figures every pull request used to rewrite: `prepare`'s `quality
baseline` step builds, then runs `npm run quality:baseline -- --release --dist`, which writes the test counts, the
first visit (now with `initialJsBytes`), and the READMEs' figures and install line. The candidate's `heavy` job runs
each of its three attempts in three shards: nine jobs of about 15 minutes, where three took up to 44.

**For contributors**, the 131 mutation exemptions due at 4.6.0 were read again (`docs/dev/MUTANTS.md`), and CI has a
`routes` job (Chromium and WebKit). A pull request's `npm run quality:baseline` writes the behaviour only (the games'
witnesses and proofs, the golden saves, the API's hash, the README's reference-proof figure), so two pull requests no
longer conflict on the test counts or the first visit; `--check` warns of more tests and of the first visit's bytes
since the release, and still fails on a behaviour change or on fewer test declarations
([The quality baseline](contribute.quality-baseline.md)). The coverage floors live in `tests/coverage-floors.json`
([The coverage ratchet](contribute.coverage-ratchet.md)): raising one re-runs no mutation set.
