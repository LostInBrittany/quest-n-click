### Fixed

- **`face: 'hero'` turns a character toward the hero (4.2.4)**: `{ face: 'hero', who: 'grandma' }` turned grandma to
  the right wherever the hero stood, since the hero is not a hotspot, a prop nor an actor; the `face` command now reads
  the hero's position from the state, as it already did for the hero turning toward someone. Found while making
  "Jack cherche un taf", in an opening cutscene.
