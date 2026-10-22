### Changes

- **A hotspot can act on a single tap, as an exit can (4.4.0, #221)**: a hotspot that says `onTap: 'go'` answers a
  single tap with no verb picked as an exit with `input.exitOnTap` does (#188): the hero walks there and acts on
  arrival with the double tap's verb (`defaultVerb`). E.g. an endless aisle that says why one does not walk down it,
  the LucasArts "Walk to" that gives a comment. Without it a tap on a hotspot only walks there, as before;
  `input.exitOnTap` stays about exits. Input only: rules, solver and saves do not see it. Nothing to change in a game.
