### Changes

- **A map without pins, or with small dots (4.6.1, #428)**: `map.pins` says how the places are marked, for a map whose
  picture already draws them. `pins: 'hidden'` takes the pins away: each place is still a button, named for screen
  readers, the size of a face and centred on its `pos`, but transparent; its "!" still shows there and the keyboard
  focus rings it. `pins: 'dots'` puts a small token in each of those buttons (a stone-coloured disc with a soft shadow,
  or the image `map.vehicles.dot`), glowing warm on hover and focus, and the hero the player plays now standing on the
  current place instead of its token (their `idle` frame, the variant and palette that apply); when the player travels,
  the walker or the vehicle takes over and the hero stands on the new place on arrival. With both, places that join
  one pin get one button each, the route runs from spot to spot, the "Where to?" list is unchanged and `portrait` is
  not drawn. The default, `pins: 'faces'`, draws the pins as before; the validator refuses another value. Presentation
  only: rules, saves and the solver do not see it.
