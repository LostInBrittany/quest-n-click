## an end that rolls the credits, shows the title, and lets the world go on

The Great Racket ends its first chapter with three pictures, an end card, the credits, then the title; Continue should
bring the player back to wander. `{ end: true }` showed nothing in the browser (`DomPresenter.end()` was empty), so the
game reached `App.credits()` and `App.showTitle()` through `ui.app` in a custom command. And the save it left had
`done: true`: a load kept it, `exec` stopped every list after its first command and `advance` said `blocked`.

`end` takes `credits`, `title`, `keepPlaying` beside its `true` (as `ending` takes `after`), so the Studio's form stays
a switch with three optional ones. The handler hands `{ credits, title }` to `Presenter.end(how?)` (the port is
additive: `EndShow`); `DomPresenter` rolls the credits (`menus.credits` now resolves once they are gone) then shows the
title, without holding the engine, the end being saved already. `keepPlaying` is a state field (`GameState.keepPlaying`,
in the save schema) rather than a save without `done`, so a later autosave of the live state cannot lose it; `load`
clears `done` when it is set (`afterEnd`, core/migrate.ts), and a later end without it (or a sealed ending) deletes it. The solver and the replays
still read `done` in the session: nothing changes for them. The validator refuses `credits` without `GameDef.credits`.
Tested in `tests/end-credits.test.ts`; documented in create.title-credits (`#end-of-chapter`) and create.commands (EN,
FR), create.dsl and engine.api regenerated.

→ next: nothing.
