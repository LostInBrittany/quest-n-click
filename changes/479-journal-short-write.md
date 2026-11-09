### Fixed

- **The Bridge's journal survives a nearly full disk (next, #479)**: a write there can take part of what it is given
  and say so without failing, and the default store never checked. `bridge compact` or forgetting a player could
  rename a cut file over the journal, losing every line after the cut; an append could leave a torn line that the
  next one joined, so the Bridge refused to start. Every byte is now written or the write fails: a rewrite fails
  before its rename and leaves the journal whole, and a failed append takes its cut line back.
