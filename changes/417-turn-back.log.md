## a character turns back once the hero is done with it

The Great Racket's village square has two players facing each other across their tiles. Talking to one turned him to
the hero (`faceEachOther`, `core/movement.ts`, through `ui.face` only) and nothing turned him back, so after "Bye" the
grumpy player stared at the hero for the rest of the visit.

`ActorDef.turnBack` (presentation, `ir-fields.ts`): `Engine.act` calls `turnBack` after `resolve`, so after the rule,
the look line or the fallback, and after a whole conversation, since `talkLoop` runs inside the action and returns at
"Bye". The side is the state's (`state.actors[...].facing`, written by `face` and `place`), else the room's `facing`,
else the layout's mirror: the side a reload draws, so a session and a reloaded one agree, and a topic that turned the
character to the hero with `face` keeps it so. Nothing when the action left the room or hid the character. Tested in
`tests/turn-back.test.ts` (talk until "Bye", a look line, a give rule, a `face` command, the option off).

→ next: nothing.
