### Fixed

- **CI runs `e2e:portrait` (next, #508)**: the only check of the 4.6.0 `skin.portrait` layout (the rotate overlay, the
  panel at five upright sizes with and without safe areas, 44 px touch targets, a turn to landscape and back) ran only
  by hand. It is now a step of the `e2e` job's Chromium `full` row, on the sample game's production build that row
  already serves, under the same `e2e` gate; its screenshots land with the row's on a failure.
