### Changes

- **A save made in another revision asks before it is resumed (4.2.2, ADR 0026)**: in a hosted Studio's preview, a
  save records the revision and the fingerprint of the content it was made in (beside it: the save format does not
  change). Resumed where the content differs, on Continue or from a slot, the game asks: Resume here (it may fail if
  this revision removed what the save refers to), Restart, or Stay in the save's own revision. The same content under
  another revision number asks nothing. The player's builds are unchanged. The Studio's Play tab offers "Load the
  latest preview".
