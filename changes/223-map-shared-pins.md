### Changes

- **One map pin for a city with several places (4.4.0, #223)**: a place's `portrait` can be a list, its faces side by
  side on the pin, and a place that says `joins: '<place>'` sits on that place's pin instead of having its own: once
  it is unlocked its face is added there, a tap on a face travels to that face's place, from any of them the pin is
  "here" (only the current face ringed), and moving between two places of one pin draws no journey. E.g. a city whose
  reception and office upstairs are both destinations. A pin with one place renders as before; the validator wants
  the joined place to exist, in the same region, and not to join another itself. Nothing to change in a game.
