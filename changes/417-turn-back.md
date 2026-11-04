### Changes

- **A character turns back to its side once the hero is done with it (4.6.1, #417)**: a character the hero looks at,
  talks to or gives something to turns to face the hero, and stayed so. With `turnBack: true` on the room's actor, it
  turns back once the action is over (a conversation at "Bye") to the side it stands facing: a `face` command's, else
  `facing`, else the layout's mirror. E.g. two players facing each other across their game. Presentation only: rules,
  saves and the solver do not see it.
