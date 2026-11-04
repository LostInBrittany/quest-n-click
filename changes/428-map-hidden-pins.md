### Changes

- **A map without pins (4.6.1, #428)**: `map.pins: 'hidden'` takes the pins off the travel map, for a map whose picture
  already draws its places. Each place is still a button, named for screen readers, the size of a face and centred on
  its `pos`, but transparent: the player taps the landmark itself. Its "!" still shows there, the keyboard focus rings
  it, and places that join one pin get one such button each. The "Where to?" list is unchanged and `portrait` is not
  drawn. The default, `pins: 'faces'`, draws the pins as before; the validator refuses another value. Presentation
  only: rules, saves and the solver do not see it.
