### Changes

- **Travel on foot on the map (4.7.0, #422)**: `vehicle: 'walk'` on a place sends the hero walking along the route
  instead of a car: the character the player plays now, as the room draws them (the variant that applies, so the hero
  chosen at New Game), with their `walk` frames at their `fps`, flipped when the way goes left, and `walk_back` or
  `walk_front` on a mostly vertical stretch when the sheet has them. The walker is 12% of the map's height, feet on the
  route; the journey still lasts 1.6 s. A hero with no `walk` frames travels by car. Presentation only: rules, saves
  and the solver do not see it.
