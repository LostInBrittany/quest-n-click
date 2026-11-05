### Fixed

- **A child region of the map shows once it is open (4.7.0, #421)**: the travel map offered the zoom button to a child
  region from the start, even with none of its places unlocked, which spoiled what comes and led to an empty map. A
  child region now shows only once a place in it, or in a region below it, is unlocked. The region the map opens on
  stays reachable, and the way back up is always there. A region in the middle of three levels has both buttons, the
  way down above the way up (it had only the way up).

### Changes

- **A region's `frame` is drawn (4.7.0, #421)**: `frame: [x, y, w, h]` was documented but drawn by nothing, so games
  painted the area into the parent's image, where it showed from the start. The map now outlines it on the parent's
  image, in the zoom button's yellow, once the region is open. Remove a frame painted into the image.
