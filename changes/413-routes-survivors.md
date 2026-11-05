### Changes

- **The `routes` mutation set is gated (4.7.0, #413)**: its 53 survivors of the 4.6.0 nightly are read, 49 killed by
  tests and 4 named in `docs/dev/mutants.json`, so a survivor nobody named now fails its job like every other set's,
  and `MEASURED` is empty again. The new tests pin what a route does with a character that has no actor or no
  position in a room, a walk that ends exactly on its point or at the foot of a ladder, a wait of exactly one tick, a
  save whose step is past the last one, and a game without routes that never loads the routes' engine. Nothing changes
  for a player, an author or a host.
